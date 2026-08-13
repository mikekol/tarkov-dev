/// <reference path="./global.d.ts" />
import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "url";
import * as path from "path";
import * as fs from "fs";
import { PNG } from "pngjs";

const SVG_FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "test-map.svg");

// Ring colors as defined in e2e/fixtures/test-map.svg
const COLORS = {
    background: "#1a1a2e", // outside ±600m
    ring600: "#1abc9c", // ±550m – ±600m
    ring550: "#f39c12", // ±500m – ±550m
    ring500: "#c0392b", // ±450m – ±500m
    ring450: "#16a085", // ±400m – ±450m
    ring400: "#8e44ad", // ±350m – ±400m
    ring350: "#2980b9", // ±300m – ±350m
    ring300: "#27ae60", // ±250m – ±300m
    ring250: "#f5a623", // ±200m – ±250m
    ring200: "#e94560", // ±150m – ±200m
    ring150: "#533483", // ±100m – ±150m
    ring100: "#0f3460", // ±50m  – ±100m
    ring50: "#16213e", // ±5m   – ±50m
    center: "#ffffff", // ±5m
};

// Each entry: zoom to viewRadius, then sample the pixel at (sampleX, sampleZ) game coords.
// sampleX/Z sit just inside the innermost ring that should be visible at that radius.
const RING_CASES = [
    { viewRadius: 50, sampleX: 40, sampleZ: 40, expectedColor: COLORS.ring50, desc: "ring50" },
    { viewRadius: 100, sampleX: 80, sampleZ: 80, expectedColor: COLORS.ring100, desc: "ring100" },
    { viewRadius: 150, sampleX: 130, sampleZ: 130, expectedColor: COLORS.ring150, desc: "ring150" },
    { viewRadius: 200, sampleX: 175, sampleZ: 175, expectedColor: COLORS.ring200, desc: "ring200" },
    { viewRadius: 250, sampleX: 225, sampleZ: 225, expectedColor: COLORS.ring250, desc: "ring250" },
    { viewRadius: 300, sampleX: 275, sampleZ: 275, expectedColor: COLORS.ring300, desc: "ring300" },
    { viewRadius: 350, sampleX: 325, sampleZ: 325, expectedColor: COLORS.ring350, desc: "ring350" },
    { viewRadius: 400, sampleX: 375, sampleZ: 375, expectedColor: COLORS.ring400, desc: "ring400" },
    { viewRadius: 450, sampleX: 425, sampleZ: 425, expectedColor: COLORS.ring450, desc: "ring450" },
    { viewRadius: 500, sampleX: 475, sampleZ: 475, expectedColor: COLORS.ring500, desc: "ring500" },
];

function rgbHex(r: number, g: number, b: number): string {
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

async function pagePixelColor(page: Page, pixelX: number, pixelY: number): Promise<string> {
    const buf = await page.screenshot({ clip: { x: pixelX, y: pixelY, width: 1, height: 1 } });
    const png = PNG.sync.read(buf);
    return rgbHex(png.data[0], png.data[1], png.data[2]);
}

async function gameToPagePixel(page: Page, gameX: number, gameZ: number): Promise<{ x: number; y: number }> {
    return page.evaluate(
        ({ gx, gz }) => {
            const map = window.__map;
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
    await page.waitForTimeout(800);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dispatchPositionRawRadius(page: Page, viewRadius: any): Promise<void> {
    await page.evaluate(
        ({ r }) => {
            window.__store.dispatch({
                type: "settings/setPlayerPosition",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                payload: { map: "test-map", position: { x: 0, y: 0, z: 0 }, rotation: 0, viewRadius: r } as any,
            });
        },
        { r: viewRadius },
    );
    await page.waitForTimeout(200);
}

async function dispatchPositionNoRadius(page: Page, gameX: number, gameZ: number): Promise<void> {
    await page.evaluate(
        ({ x, z }) => {
            window.__store.dispatch({
                type: "settings/setPlayerPosition",
                payload: { map: "test-map", position: { x, y: 0, z }, rotation: 0 },
            });
        },
        { x: gameX, z: gameZ },
    );
    await page.waitForTimeout(800);
}

test.describe("Remote map zoom — visual ring validation", () => {
    test.beforeEach(async ({ page }) => {
        await page.route("**/json.tarkov.dev/**", (route) =>
            route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
        );

        const svgContent = fs.readFileSync(SVG_FIXTURE, "utf-8");
        await page.route("**/assets.tarkov.dev/maps/test-map/base.svg", (route) =>
            route.fulfill({ status: 200, contentType: "image/svg+xml", body: svgContent }),
        );

        await page.goto("/map/test-map");

        await page.waitForFunction(() => !!window.__map, { timeout: 15000 });
        await page.waitForFunction(() => !!document.querySelector(".leaflet-overlay-pane svg rect"), {
            timeout: 15000,
        });
    });

    for (const { viewRadius, sampleX, sampleZ, expectedColor, desc } of RING_CASES) {
        test(`viewRadius=${viewRadius} → viewport shows ${desc} at (${sampleX},${sampleZ})`, async ({ page }) => {
            await dispatchPosition(page, 0, 0, viewRadius);

            const bounds = await page.evaluate(() => {
                const b = window.__map.getBounds();
                return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
            });
            expect(bounds.north).toBeGreaterThanOrEqual(viewRadius);
            expect(bounds.north).toBeLessThan(viewRadius * 2);
            expect(bounds.south).toBeLessThanOrEqual(-viewRadius);
            expect(bounds.south).toBeGreaterThan(-viewRadius * 2);
            expect(bounds.east).toBeGreaterThanOrEqual(viewRadius);
            expect(bounds.west).toBeLessThanOrEqual(-viewRadius);

            const samplePx = await gameToPagePixel(page, sampleX, sampleZ);
            expect(await pagePixelColor(page, samplePx.x, samplePx.y)).toBe(expectedColor);
        });
    }

    test("viewRadius=0 clears zoom tracking (remoteViewRadius becomes null)", async ({ page }) => {
        await dispatchPosition(page, 0, 0, 200);

        const zoomedRadius = await page.evaluate(
            () =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window.__store.getState() as any).settings.remoteViewRadius,
        );
        expect(zoomedRadius).toBe(200);

        await dispatchPosition(page, 0, 0, 0);

        const clearedRadius = await page.evaluate(
            () =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window.__store.getState() as any).settings.remoteViewRadius,
        );
        expect(clearedRadius).toBeNull();
    });

    test("omitting viewRadius leaves remoteViewRadius unchanged", async ({ page }) => {
        await dispatchPosition(page, 0, 0, 200);

        const before = await page.evaluate(
            () =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window.__store.getState() as any).settings.remoteViewRadius,
        );
        expect(before).toBe(200);

        await dispatchPositionNoRadius(page, 50, 50);

        const after = await page.evaluate(
            () =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window.__store.getState() as any).settings.remoteViewRadius,
        );
        expect(after).toBe(200);
    });

    test("garbage viewRadius values do not crash the app", async ({ page }) => {
        const badValues = [
            // numeric edge cases
            -1,
            -200,
            -Infinity,
            Infinity,
            NaN,
            Number.MAX_SAFE_INTEGER,
            Number.MIN_SAFE_INTEGER,
            1e308,
            // strings
            "200",
            "hello",
            "",
            " ",
            "null",
            "undefined",
            "NaN",
            '{"viewRadius":200}',
            "<script>alert(1)</script>",
            // wrong types
            null,
            true,
            false,
            {},
            [],
            [200],
            { viewRadius: 200 },
        ];

        for (const bad of badValues) {
            // set known good state
            await dispatchPosition(page, 0, 0, 200);

            // fire the garbage value
            await dispatchPositionRawRadius(page, bad);

            // page must still be alive and map accessible
            const mapAlive = await page.evaluate(() => !!window.__map?.getBounds);
            expect(mapAlive, `map dead after viewRadius=${JSON.stringify(bad)}`).toBe(true);

            // remoteViewRadius must be null or a finite non-negative number — never the raw garbage
            const radius = await page.evaluate(
                () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (window.__store.getState() as any).settings.remoteViewRadius,
            );
            const isAcceptable = radius === null || (typeof radius === "number" && isFinite(radius) && radius >= 0);
            expect(
                isAcceptable,
                `bad remoteViewRadius=${JSON.stringify(radius)} after input=${JSON.stringify(bad)}`,
            ).toBe(true);
        }
    });
});
