import "dotenv/config";
import "@testing-library/jest-dom";

import { resetIntersectionMocking, setupIntersectionMocking } from "react-intersection-observer/test-utils";
import { afterEach, beforeEach, rstest } from "@rstest/core";

const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
            store[key] = value;
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
    };
})();

Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    writable: true,
});

beforeEach(() => {
    setupIntersectionMocking(rstest.fn);
});

afterEach(() => {
    resetIntersectionMocking();
});
