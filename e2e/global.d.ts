import type { Map as LeafletMap } from "leaflet";
import type { Store } from "@reduxjs/toolkit";

declare global {
    interface Window {
        __map: LeafletMap;
        __store: Store;
        L: typeof import("leaflet");
    }
}
