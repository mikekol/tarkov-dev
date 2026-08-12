/// <reference path="./global.d.ts" />
import { test, expect, type Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { PNG } from "pngjs";

const SVG_FIXTURE = path.join(__dirname, "fixtures", "test-map.svg");

// Ring colors as defined in e2e/fixtures/test-map.svg
const COLORS = {
    background: "#1a1a2e", // outside ±200m
    ring200: "#e94560", // ±150m – ±200m
    ring150: "#533483", // ±100m – ±150m
    ring100: "#0f3460", // ±50m  – ±100m
    ring50: "#16213e", // ±5m   – ±50m
    center: "#ffffff", // ±5m
};

function rgbHex(r: number, g: number, b: number): string {
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

async function pagePixelColor(page: Page, pixelX: number, pixelY: number): Promise<string> {
    const buf = await page.screenshot({ clip: { x: pixelX, y: pixelY, width: 1, height: 1 } });
    const png = PNG.sync.read(buf);
    return rgbHex(png.data[0], png.data[1], png.data[2]);
}

// Convert game coords (x, z) to page-level pixel coordinates.
// Returns {x, y} in CSS pixels relative to the top-left of the page.
async function gameToPagePixel(page: Page, gameX: number, gameZ: number): Promise<{ x: number; y: number }> {
    return page.evaluate(
        ({ gx, gz }) => {
            const map = window.__map;
            // Leaflet accepts [lat, lng] arrays — lat = z (game depth), lng = x (game right)
            const pt = map.latLngToContainerPoint([gz, gx] as [number, number]);
            const rect = map.getContainer().getBoundingClientRect();
            return { x: Math.round(rect.left + pt.x), y: Math.round(rect.top + pt.y) };
        },
        { gx: gameX, gz: gameZ },
    );
}

async function dispatchPosition(page: Page, gameX: number, gameZ: number, viewRadius: number): Promise<void> {
    await page.evaluate(
        ({ x, z, r }) => {
            window.__store.dispatch({
                type: "settings/setPlayerPosition",
                payload: { map: "test-map", position: { x, y: 0, z }, rotation: 0, viewRadius: r },
            });
        },
        { x: gameX, z: gameZ, r: viewRadius },
    );
    await page.waitForTimeout(800); // allow fitBounds animation to settle
}

test.describe("Remote map zoom — visual ring validation", () => {
    test.beforeEach(async ({ page }) => {
        // Prevent real API calls; test map gets no game-data (bosses/spawns/etc. → empty)
        await page.route("**/json.tarkov.dev/**", (route) =>
            route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
        );

        // Serve the concentric-squares SVG fixture for our test map
        const svgContent = fs.readFileSync(SVG_FIXTURE, "utf-8");
        await page.route("**/assets.tarkov.dev/maps/test-map/base.svg", (route) =>
            route.fulfill({ status: 200, contentType: "image/svg+xml", body: svgContent }),
        );

        await page.goto("/map/test-map");

        // Wait for Leaflet map and SVG overlay to be ready
        await page.waitForFunction(() => !!window.__map, { timeout: 15000 });
        await page.waitForFunction(() => !!document.querySelector(".leaflet-overlay-pane svg"), {
            timeout: 15000,
        });
    });

    test("viewRadius=200 fits the viewport to the 200m ring", async ({ page }) => {
        await dispatchPosition(page, 0, 0, 200);

        // --- Numeric bounds check ---
        const bounds = await page.evaluate(() => {
            const b = window.__map.getBounds();
            return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
        });
        // Leaflet snaps to discrete zoom levels, so the actual bounds may be slightly
        // larger than the requested ±200. They should not be less than ±200 or more
        // than ±400 (which would indicate the wrong zoom level entirely).
        expect(bounds.north).toBeGreaterThanOrEqual(200);
        expect(bounds.north).toBeLessThan(400);
        expect(bounds.south).toBeLessThanOrEqual(-200);
        expect(bounds.south).toBeGreaterThan(-400);
        expect(bounds.east).toBeGreaterThanOrEqual(200);
        expect(bounds.west).toBeLessThanOrEqual(-200);

        // --- Visual ring check ---
        // Game coord (175, 175): inside the 200m ring (>150m, <200m from center)
        // → should show ring200 color
        const ring200Px = await gameToPagePixel(page, 175, 175);
        expect(await pagePixelColor(page, ring200Px.x, ring200Px.y)).toBe(COLORS.ring200);

        // Center (0, 0): should show the center marker color
        const centerPx = await gameToPagePixel(page, 0, 0);
        expect(await pagePixelColor(page, centerPx.x, centerPx.y)).toBe(COLORS.center);
    });

    test("viewRadius=100 fits the viewport to the 100m ring", async ({ page }) => {
        await dispatchPosition(page, 0, 0, 100);

        const bounds = await page.evaluate(() => {
            const b = window.__map.getBounds();
            return { north: b.getNorth(), south: b.getSouth() };
        });
        expect(bounds.north).toBeGreaterThanOrEqual(100);
        expect(bounds.north).toBeLessThan(200);
        expect(bounds.south).toBeLessThanOrEqual(-100);
        expect(bounds.south).toBeGreaterThan(-200);

        // Game coord (80, 80): inside the 100m ring (>50m, <100m from center)
        // → should show ring100 color
        const ring100Px = await gameToPagePixel(page, 80, 80);
        expect(await pagePixelColor(page, ring100Px.x, ring100Px.y)).toBe(COLORS.ring100);
    });

    test("viewRadius=0 falls back to panTo (no zoom)", async ({ page }) => {
        // First zoom in, then send viewRadius=0 to confirm zoom is cleared
        await dispatchPosition(page, 0, 0, 200);
        const zoomedBounds = await page.evaluate(() => {
            const b = window.__map.getBounds();
            return b.getNorth();
        });

        await dispatchPosition(page, 0, 0, 0);
        const postClearBounds = await page.evaluate(() => {
            const b = window.__map.getBounds();
            return b.getNorth();
        });

        // After clearing zoom, the map should have panned (not re-zoomed)
        // — the visible north should be much larger than the 200m-zoom view
        expect(postClearBounds).toBeGreaterThan(zoomedBounds + 100);
    });
});
