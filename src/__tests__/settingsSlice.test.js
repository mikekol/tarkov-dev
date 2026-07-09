import { expect, it, describe, beforeEach } from "@rstest/core";
import settingsReducer, { setPlayerPosition } from "#src/features/settings/settingsSlice.mjs";

describe("settingsSlice - playerPosition and zoom", () => {
    let initialState;

    beforeEach(() => {
        initialState = {
            playerPosition: null,
            remoteMapZoom: null,
        };
    });

    it("should set player position without zoom (backward compatibility)", () => {
        const position = {
            map: "interchange",
            position: { x: 100, y: 200, z: 50 },
            rotation: 45,
        };

        const state = settingsReducer(initialState, setPlayerPosition(position));

        expect(state.playerPosition).toEqual(position);
        expect(state.remoteMapZoom).toBeNull();
    });

    it("should set player position with zoom level", () => {
        const positionWithZoom = {
            map: "interchange",
            position: { x: 100, y: 200, z: 50 },
            rotation: 45,
            zoomLevel: 15,
        };

        const state = settingsReducer(initialState, setPlayerPosition(positionWithZoom));

        expect(state.playerPosition).toEqual({
            map: "interchange",
            position: { x: 100, y: 200, z: 50 },
            rotation: 45,
        });
        expect(state.remoteMapZoom).toBe(15);
    });

    it("should clear player position and zoom when set to null", () => {
        const stateWithPosition = {
            playerPosition: {
                map: "interchange",
                position: { x: 100, y: 200, z: 50 },
                rotation: 45,
            },
            remoteMapZoom: 15,
        };

        const state = settingsReducer(stateWithPosition, setPlayerPosition(null));

        expect(state.playerPosition).toBeNull();
        // zoom should remain unchanged when clearing position
        expect(state.remoteMapZoom).toBe(15);
    });

    it("should handle zoom level that is not a number gracefully", () => {
        const positionWithBadZoom = {
            map: "interchange",
            position: { x: 100, y: 200, z: 50 },
            rotation: 45,
            zoomLevel: "not-a-number",
        };

        const state = settingsReducer(initialState, setPlayerPosition(positionWithBadZoom));

        expect(state.playerPosition).toBeDefined();
        // Should set zoom to null since it's not a finite number
        expect(state.remoteMapZoom).toBeNull();
    });

    it("should allow zoom level 0 (fully zoomed out)", () => {
        const positionWithZeroZoom = {
            map: "interchange",
            position: { x: 100, y: 200, z: 50 },
            rotation: 45,
            zoomLevel: 0,
        };

        const state = settingsReducer(initialState, setPlayerPosition(positionWithZeroZoom));

        expect(state.remoteMapZoom).toBe(0);
    });
});
