import { expect, it, describe, beforeEach } from "@rstest/core";
import settingsReducer, { setPlayerPosition } from "#src/features/settings/settingsSlice.mjs";

describe("settingsSlice - playerPosition and viewRadius", () => {
    let initialState;

    beforeEach(() => {
        initialState = {
            playerPosition: null,
            remoteViewRadius: null,
        };
    });

    it("should set player position without viewRadius (backward compatibility)", () => {
        const position = {
            map: "interchange",
            position: { x: 100, y: 200, z: 50 },
            rotation: 45,
        };

        const state = settingsReducer(initialState, setPlayerPosition(position));

        expect(state.playerPosition).toEqual(position);
        expect(state.remoteViewRadius).toBeNull();
    });

    it("should set player position with viewRadius", () => {
        const positionWithRadius = {
            map: "interchange",
            position: { x: 100, y: 200, z: 50 },
            rotation: 45,
            viewRadius: 200,
        };

        const state = settingsReducer(initialState, setPlayerPosition(positionWithRadius));

        expect(state.playerPosition).toEqual({
            map: "interchange",
            position: { x: 100, y: 200, z: 50 },
            rotation: 45,
        });
        expect(state.remoteViewRadius).toBe(200);
    });

    it("should clear player position when set to null, leaving viewRadius unchanged", () => {
        const stateWithPosition = {
            playerPosition: {
                map: "interchange",
                position: { x: 100, y: 200, z: 50 },
                rotation: 45,
            },
            remoteViewRadius: 200,
        };

        const state = settingsReducer(stateWithPosition, setPlayerPosition(null));

        expect(state.playerPosition).toBeNull();
        // viewRadius should remain unchanged when clearing position
        expect(state.remoteViewRadius).toBe(200);
    });

    it("should handle viewRadius that is not a number gracefully", () => {
        const positionWithBadRadius = {
            map: "interchange",
            position: { x: 100, y: 200, z: 50 },
            rotation: 45,
            viewRadius: "not-a-number",
        };

        const state = settingsReducer(initialState, setPlayerPosition(positionWithBadRadius));

        expect(state.playerPosition).toBeDefined();
        // Should set remoteViewRadius to null since it's not a finite number
        expect(state.remoteViewRadius).toBeNull();
    });

    it("should ignore viewRadius of zero or negative", () => {
        const positionWithZeroRadius = {
            map: "interchange",
            position: { x: 100, y: 200, z: 50 },
            rotation: 45,
            viewRadius: 0,
        };

        const state = settingsReducer(initialState, setPlayerPosition(positionWithZeroRadius));

        expect(state.remoteViewRadius).toBeNull();
    });

    it("should preserve remoteViewRadius when position update has no viewRadius (backward compatibility)", () => {
        const stateWithRadius = {
            playerPosition: null,
            remoteViewRadius: 200,
        };
        const position = {
            map: "interchange",
            position: { x: 100, y: 200, z: 50 },
            rotation: 45,
            // no viewRadius field — simulates old TarkovMonitor client
        };

        const state = settingsReducer(stateWithRadius, setPlayerPosition(position));

        expect(state.playerPosition).toEqual(position);
        // Old clients don't send viewRadius; existing radius must not be cleared
        expect(state.remoteViewRadius).toBe(200);
    });
});
