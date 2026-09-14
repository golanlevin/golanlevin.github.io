declare namespace wasm_bindgen {
    /* tslint:disable */
    /* eslint-disable */

    export class WasmArap {
        free(): void;
        [Symbol.dispose](): void;
        deform(targets: Float64Array, scale_adjust: boolean): Float64Array;
        constructor(vertices: Float64Array, triangles: Uint32Array, constrained: Uint32Array);
    }

}
declare type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

declare interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmarap_free: (a: number, b: number) => void;
    readonly wasmarap_deform: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly wasmarap_new: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
declare function wasm_bindgen (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
