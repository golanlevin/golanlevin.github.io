/*
 * ArapP5
 * p5.js wrapper for Kyle McDonald's clean-room ARAP 2D solver.
 * Load this file, serve arap2d_bg.wasm beside it, then use ArapP5.ArapShape.
 */
let wasm_bindgen = (function(exports) {
    let script_src;
    if (typeof document !== 'undefined' && document.currentScript !== null) {
        script_src = new URL(document.currentScript.src, location.href).toString();
    }

    class WasmArap {
        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            WasmArapFinalization.unregister(this);
            return ptr;
        }
        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_wasmarap_free(ptr, 0);
        }
        /**
         * @param {Float64Array} targets
         * @param {boolean} scale_adjust
         * @returns {Float64Array}
         */
        deform(targets, scale_adjust) {
            const ptr0 = passArrayF64ToWasm0(targets, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmarap_deform(this.__wbg_ptr, ptr0, len0, scale_adjust);
            if (ret[3]) {
                throw takeFromExternrefTable0(ret[2]);
            }
            var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
            return v2;
        }
        /**
         * @param {Float64Array} vertices
         * @param {Uint32Array} triangles
         * @param {Uint32Array} constrained
         */
        constructor(vertices, triangles, constrained) {
            const ptr0 = passArrayF64ToWasm0(vertices, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray32ToWasm0(triangles, wasm.__wbindgen_malloc);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passArray32ToWasm0(constrained, wasm.__wbindgen_malloc);
            const len2 = WASM_VECTOR_LEN;
            const ret = wasm.wasmarap_new(ptr0, len0, ptr1, len1, ptr2, len2);
            if (ret[2]) {
                throw takeFromExternrefTable0(ret[1]);
            }
            this.__wbg_ptr = ret[0];
            WasmArapFinalization.register(this, this.__wbg_ptr, this);
            return this;
        }
    }
    if (Symbol.dispose) WasmArap.prototype[Symbol.dispose] = WasmArap.prototype.free;
    exports.WasmArap = WasmArap;
    function __wbg_get_imports() {
        const import0 = {
            __proto__: null,
            __wbg___wbindgen_throw_9c31b086c2b26051: function(arg0, arg1) {
                throw new Error(getStringFromWasm0(arg0, arg1));
            },
            __wbindgen_cast_0000000000000001: function(arg0, arg1) {
                // Cast intrinsic for `Ref(String) -> Externref`.
                const ret = getStringFromWasm0(arg0, arg1);
                return ret;
            },
            __wbindgen_init_externref_table: function() {
                const table = wasm.__wbindgen_externrefs;
                const offset = table.grow(4);
                table.set(0, undefined);
                table.set(offset + 0, undefined);
                table.set(offset + 1, null);
                table.set(offset + 2, true);
                table.set(offset + 3, false);
            },
        };
        return {
            __proto__: null,
            "./arap2d_bg.js": import0,
        };
    }

    const WasmArapFinalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_wasmarap_free(ptr, 1));

    function getArrayF64FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
    }

    let cachedFloat64ArrayMemory0 = null;
    function getFloat64ArrayMemory0() {
        if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
            cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
        }
        return cachedFloat64ArrayMemory0;
    }

    function getStringFromWasm0(ptr, len) {
        return decodeText(ptr >>> 0, len);
    }

    let cachedUint32ArrayMemory0 = null;
    function getUint32ArrayMemory0() {
        if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
            cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
        }
        return cachedUint32ArrayMemory0;
    }

    let cachedUint8ArrayMemory0 = null;
    function getUint8ArrayMemory0() {
        if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
            cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
        }
        return cachedUint8ArrayMemory0;
    }

    function passArray32ToWasm0(arg, malloc) {
        const ptr = malloc(arg.length * 4, 4) >>> 0;
        getUint32ArrayMemory0().set(arg, ptr / 4);
        WASM_VECTOR_LEN = arg.length;
        return ptr;
    }

    function passArrayF64ToWasm0(arg, malloc) {
        const ptr = malloc(arg.length * 8, 8) >>> 0;
        getFloat64ArrayMemory0().set(arg, ptr / 8);
        WASM_VECTOR_LEN = arg.length;
        return ptr;
    }

    function takeFromExternrefTable0(idx) {
        const value = wasm.__wbindgen_externrefs.get(idx);
        wasm.__externref_table_dealloc(idx);
        return value;
    }

    let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    function decodeText(ptr, len) {
        return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
    }

    let WASM_VECTOR_LEN = 0;

    let wasmModule, wasmInstance, wasm;
    function __wbg_finalize_init(instance, module) {
        wasmInstance = instance;
        wasm = instance.exports;
        wasmModule = module;
        cachedFloat64ArrayMemory0 = null;
        cachedUint32ArrayMemory0 = null;
        cachedUint8ArrayMemory0 = null;
        wasm.__wbindgen_start();
        return wasm;
    }

    async function __wbg_load(module, imports) {
        if (typeof Response === 'function' && module instanceof Response) {
            if (typeof WebAssembly.instantiateStreaming === 'function') {
                try {
                    return await WebAssembly.instantiateStreaming(module, imports);
                } catch (e) {
                    const validResponse = module.ok && expectedResponseType(module.type);

                    if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                        console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                    } else { throw e; }
                }
            }

            const bytes = await module.arrayBuffer();
            return await WebAssembly.instantiate(bytes, imports);
        } else {
            const instance = await WebAssembly.instantiate(module, imports);

            if (instance instanceof WebAssembly.Instance) {
                return { instance, module };
            } else {
                return instance;
            }
        }

        function expectedResponseType(type) {
            switch (type) {
                case 'basic': case 'cors': case 'default': return true;
            }
            return false;
        }
    }

    function initSync(module) {
        if (wasm !== undefined) return wasm;


        if (module !== undefined) {
            if (Object.getPrototypeOf(module) === Object.prototype) {
                ({module} = module)
            } else {
                console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
            }
        }

        const imports = __wbg_get_imports();
        if (!(module instanceof WebAssembly.Module)) {
            module = new WebAssembly.Module(module);
        }
        const instance = new WebAssembly.Instance(module, imports);
        return __wbg_finalize_init(instance, module);
    }

    async function __wbg_init(module_or_path) {
        if (wasm !== undefined) return wasm;


        if (module_or_path !== undefined) {
            if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
                ({module_or_path} = module_or_path)
            } else {
                console.warn('using deprecated parameters for the initialization function; pass a single object instead')
            }
        }

        if (module_or_path === undefined && script_src !== undefined) {
            module_or_path = script_src.replace(/\.js$/, "_bg.wasm");
        }
        const imports = __wbg_get_imports();

        if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
            module_or_path = fetch(module_or_path);
        }

        const { instance, module } = await __wbg_load(await module_or_path, imports);

        return __wbg_finalize_init(instance, module);
    }

    return Object.assign(__wbg_init, { initSync }, exports);
})({ __proto__: null });


globalThis.wasm_bindgen = wasm_bindgen;

var ArapP5 = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // ../puppetry/web/node_modules/binary-search-bounds/search-bounds.js
  var require_search_bounds = __commonJS({
    "../puppetry/web/node_modules/binary-search-bounds/search-bounds.js"(exports, module) {
      "use strict";
      function ge(a, y, c, l, h) {
        var i = h + 1;
        while (l <= h) {
          var m = l + h >>> 1, x = a[m];
          var p = c !== void 0 ? c(x, y) : x - y;
          if (p >= 0) {
            i = m;
            h = m - 1;
          } else {
            l = m + 1;
          }
        }
        return i;
      }
      function gt(a, y, c, l, h) {
        var i = h + 1;
        while (l <= h) {
          var m = l + h >>> 1, x = a[m];
          var p = c !== void 0 ? c(x, y) : x - y;
          if (p > 0) {
            i = m;
            h = m - 1;
          } else {
            l = m + 1;
          }
        }
        return i;
      }
      function lt(a, y, c, l, h) {
        var i = l - 1;
        while (l <= h) {
          var m = l + h >>> 1, x = a[m];
          var p = c !== void 0 ? c(x, y) : x - y;
          if (p < 0) {
            i = m;
            l = m + 1;
          } else {
            h = m - 1;
          }
        }
        return i;
      }
      function le(a, y, c, l, h) {
        var i = l - 1;
        while (l <= h) {
          var m = l + h >>> 1, x = a[m];
          var p = c !== void 0 ? c(x, y) : x - y;
          if (p <= 0) {
            i = m;
            l = m + 1;
          } else {
            h = m - 1;
          }
        }
        return i;
      }
      function eq(a, y, c, l, h) {
        while (l <= h) {
          var m = l + h >>> 1, x = a[m];
          var p = c !== void 0 ? c(x, y) : x - y;
          if (p === 0) {
            return m;
          }
          if (p <= 0) {
            l = m + 1;
          } else {
            h = m - 1;
          }
        }
        return -1;
      }
      function norm(a, y, c, l, h, f) {
        if (typeof c === "function") {
          return f(a, y, c, l === void 0 ? 0 : l | 0, h === void 0 ? a.length - 1 : h | 0);
        }
        return f(a, y, void 0, c === void 0 ? 0 : c | 0, l === void 0 ? a.length - 1 : l | 0);
      }
      module.exports = {
        ge: function(a, y, c, l, h) {
          return norm(a, y, c, l, h, ge);
        },
        gt: function(a, y, c, l, h) {
          return norm(a, y, c, l, h, gt);
        },
        lt: function(a, y, c, l, h) {
          return norm(a, y, c, l, h, lt);
        },
        le: function(a, y, c, l, h) {
          return norm(a, y, c, l, h, le);
        },
        eq: function(a, y, c, l, h) {
          return norm(a, y, c, l, h, eq);
        }
      };
    }
  });

  // ../puppetry/web/node_modules/two-product/two-product.js
  var require_two_product = __commonJS({
    "../puppetry/web/node_modules/two-product/two-product.js"(exports, module) {
      "use strict";
      module.exports = twoProduct;
      var SPLITTER = +(Math.pow(2, 27) + 1);
      function twoProduct(a, b, result) {
        var x = a * b;
        var c = SPLITTER * a;
        var abig = c - a;
        var ahi = c - abig;
        var alo = a - ahi;
        var d = SPLITTER * b;
        var bbig = d - b;
        var bhi = d - bbig;
        var blo = b - bhi;
        var err1 = x - ahi * bhi;
        var err2 = err1 - alo * bhi;
        var err3 = err2 - ahi * blo;
        var y = alo * blo - err3;
        if (result) {
          result[0] = y;
          result[1] = x;
          return result;
        }
        return [y, x];
      }
    }
  });

  // ../puppetry/web/node_modules/robust-sum/robust-sum.js
  var require_robust_sum = __commonJS({
    "../puppetry/web/node_modules/robust-sum/robust-sum.js"(exports, module) {
      "use strict";
      module.exports = linearExpansionSum;
      function scalarScalar(a, b) {
        var x = a + b;
        var bv = x - a;
        var av = x - bv;
        var br = b - bv;
        var ar = a - av;
        var y = ar + br;
        if (y) {
          return [y, x];
        }
        return [x];
      }
      function linearExpansionSum(e, f) {
        var ne = e.length | 0;
        var nf = f.length | 0;
        if (ne === 1 && nf === 1) {
          return scalarScalar(e[0], f[0]);
        }
        var n = ne + nf;
        var g = new Array(n);
        var count = 0;
        var eptr = 0;
        var fptr = 0;
        var abs = Math.abs;
        var ei = e[eptr];
        var ea = abs(ei);
        var fi = f[fptr];
        var fa = abs(fi);
        var a, b;
        if (ea < fa) {
          b = ei;
          eptr += 1;
          if (eptr < ne) {
            ei = e[eptr];
            ea = abs(ei);
          }
        } else {
          b = fi;
          fptr += 1;
          if (fptr < nf) {
            fi = f[fptr];
            fa = abs(fi);
          }
        }
        if (eptr < ne && ea < fa || fptr >= nf) {
          a = ei;
          eptr += 1;
          if (eptr < ne) {
            ei = e[eptr];
            ea = abs(ei);
          }
        } else {
          a = fi;
          fptr += 1;
          if (fptr < nf) {
            fi = f[fptr];
            fa = abs(fi);
          }
        }
        var x = a + b;
        var bv = x - a;
        var y = b - bv;
        var q0 = y;
        var q1 = x;
        var _x, _bv, _av, _br, _ar;
        while (eptr < ne && fptr < nf) {
          if (ea < fa) {
            a = ei;
            eptr += 1;
            if (eptr < ne) {
              ei = e[eptr];
              ea = abs(ei);
            }
          } else {
            a = fi;
            fptr += 1;
            if (fptr < nf) {
              fi = f[fptr];
              fa = abs(fi);
            }
          }
          b = q0;
          x = a + b;
          bv = x - a;
          y = b - bv;
          if (y) {
            g[count++] = y;
          }
          _x = q1 + x;
          _bv = _x - q1;
          _av = _x - _bv;
          _br = x - _bv;
          _ar = q1 - _av;
          q0 = _ar + _br;
          q1 = _x;
        }
        while (eptr < ne) {
          a = ei;
          b = q0;
          x = a + b;
          bv = x - a;
          y = b - bv;
          if (y) {
            g[count++] = y;
          }
          _x = q1 + x;
          _bv = _x - q1;
          _av = _x - _bv;
          _br = x - _bv;
          _ar = q1 - _av;
          q0 = _ar + _br;
          q1 = _x;
          eptr += 1;
          if (eptr < ne) {
            ei = e[eptr];
          }
        }
        while (fptr < nf) {
          a = fi;
          b = q0;
          x = a + b;
          bv = x - a;
          y = b - bv;
          if (y) {
            g[count++] = y;
          }
          _x = q1 + x;
          _bv = _x - q1;
          _av = _x - _bv;
          _br = x - _bv;
          _ar = q1 - _av;
          q0 = _ar + _br;
          q1 = _x;
          fptr += 1;
          if (fptr < nf) {
            fi = f[fptr];
          }
        }
        if (q0) {
          g[count++] = q0;
        }
        if (q1) {
          g[count++] = q1;
        }
        if (!count) {
          g[count++] = 0;
        }
        g.length = count;
        return g;
      }
    }
  });

  // ../puppetry/web/node_modules/two-sum/two-sum.js
  var require_two_sum = __commonJS({
    "../puppetry/web/node_modules/two-sum/two-sum.js"(exports, module) {
      "use strict";
      module.exports = fastTwoSum;
      function fastTwoSum(a, b, result) {
        var x = a + b;
        var bv = x - a;
        var av = x - bv;
        var br = b - bv;
        var ar = a - av;
        if (result) {
          result[0] = ar + br;
          result[1] = x;
          return result;
        }
        return [ar + br, x];
      }
    }
  });

  // ../puppetry/web/node_modules/robust-scale/robust-scale.js
  var require_robust_scale = __commonJS({
    "../puppetry/web/node_modules/robust-scale/robust-scale.js"(exports, module) {
      "use strict";
      var twoProduct = require_two_product();
      var twoSum = require_two_sum();
      module.exports = scaleLinearExpansion;
      function scaleLinearExpansion(e, scale) {
        var n = e.length;
        if (n === 1) {
          var ts = twoProduct(e[0], scale);
          if (ts[0]) {
            return ts;
          }
          return [ts[1]];
        }
        var g = new Array(2 * n);
        var q = [0.1, 0.1];
        var t = [0.1, 0.1];
        var count = 0;
        twoProduct(e[0], scale, q);
        if (q[0]) {
          g[count++] = q[0];
        }
        for (var i = 1; i < n; ++i) {
          twoProduct(e[i], scale, t);
          var pq = q[1];
          twoSum(pq, t[0], q);
          if (q[0]) {
            g[count++] = q[0];
          }
          var a = t[1];
          var b = q[1];
          var x = a + b;
          var bv = x - a;
          var y = b - bv;
          q[1] = x;
          if (y) {
            g[count++] = y;
          }
        }
        if (q[1]) {
          g[count++] = q[1];
        }
        if (count === 0) {
          g[count++] = 0;
        }
        g.length = count;
        return g;
      }
    }
  });

  // ../puppetry/web/node_modules/robust-subtract/robust-diff.js
  var require_robust_diff = __commonJS({
    "../puppetry/web/node_modules/robust-subtract/robust-diff.js"(exports, module) {
      "use strict";
      module.exports = robustSubtract;
      function scalarScalar(a, b) {
        var x = a + b;
        var bv = x - a;
        var av = x - bv;
        var br = b - bv;
        var ar = a - av;
        var y = ar + br;
        if (y) {
          return [y, x];
        }
        return [x];
      }
      function robustSubtract(e, f) {
        var ne = e.length | 0;
        var nf = f.length | 0;
        if (ne === 1 && nf === 1) {
          return scalarScalar(e[0], -f[0]);
        }
        var n = ne + nf;
        var g = new Array(n);
        var count = 0;
        var eptr = 0;
        var fptr = 0;
        var abs = Math.abs;
        var ei = e[eptr];
        var ea = abs(ei);
        var fi = -f[fptr];
        var fa = abs(fi);
        var a, b;
        if (ea < fa) {
          b = ei;
          eptr += 1;
          if (eptr < ne) {
            ei = e[eptr];
            ea = abs(ei);
          }
        } else {
          b = fi;
          fptr += 1;
          if (fptr < nf) {
            fi = -f[fptr];
            fa = abs(fi);
          }
        }
        if (eptr < ne && ea < fa || fptr >= nf) {
          a = ei;
          eptr += 1;
          if (eptr < ne) {
            ei = e[eptr];
            ea = abs(ei);
          }
        } else {
          a = fi;
          fptr += 1;
          if (fptr < nf) {
            fi = -f[fptr];
            fa = abs(fi);
          }
        }
        var x = a + b;
        var bv = x - a;
        var y = b - bv;
        var q0 = y;
        var q1 = x;
        var _x, _bv, _av, _br, _ar;
        while (eptr < ne && fptr < nf) {
          if (ea < fa) {
            a = ei;
            eptr += 1;
            if (eptr < ne) {
              ei = e[eptr];
              ea = abs(ei);
            }
          } else {
            a = fi;
            fptr += 1;
            if (fptr < nf) {
              fi = -f[fptr];
              fa = abs(fi);
            }
          }
          b = q0;
          x = a + b;
          bv = x - a;
          y = b - bv;
          if (y) {
            g[count++] = y;
          }
          _x = q1 + x;
          _bv = _x - q1;
          _av = _x - _bv;
          _br = x - _bv;
          _ar = q1 - _av;
          q0 = _ar + _br;
          q1 = _x;
        }
        while (eptr < ne) {
          a = ei;
          b = q0;
          x = a + b;
          bv = x - a;
          y = b - bv;
          if (y) {
            g[count++] = y;
          }
          _x = q1 + x;
          _bv = _x - q1;
          _av = _x - _bv;
          _br = x - _bv;
          _ar = q1 - _av;
          q0 = _ar + _br;
          q1 = _x;
          eptr += 1;
          if (eptr < ne) {
            ei = e[eptr];
          }
        }
        while (fptr < nf) {
          a = fi;
          b = q0;
          x = a + b;
          bv = x - a;
          y = b - bv;
          if (y) {
            g[count++] = y;
          }
          _x = q1 + x;
          _bv = _x - q1;
          _av = _x - _bv;
          _br = x - _bv;
          _ar = q1 - _av;
          q0 = _ar + _br;
          q1 = _x;
          fptr += 1;
          if (fptr < nf) {
            fi = -f[fptr];
          }
        }
        if (q0) {
          g[count++] = q0;
        }
        if (q1) {
          g[count++] = q1;
        }
        if (!count) {
          g[count++] = 0;
        }
        g.length = count;
        return g;
      }
    }
  });

  // ../puppetry/web/node_modules/robust-orientation/orientation.js
  var require_orientation = __commonJS({
    "../puppetry/web/node_modules/robust-orientation/orientation.js"(exports, module) {
      "use strict";
      var twoProduct = require_two_product();
      var robustSum = require_robust_sum();
      var robustScale = require_robust_scale();
      var robustSubtract = require_robust_diff();
      var NUM_EXPAND = 5;
      var EPSILON = 11102230246251565e-32;
      var ERRBOUND3 = (3 + 16 * EPSILON) * EPSILON;
      var ERRBOUND4 = (7 + 56 * EPSILON) * EPSILON;
      function orientation_3(sum, prod, scale, sub) {
        return function orientation3Exact2(m0, m1, m2) {
          var p = sum(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])));
          var n = sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0]));
          var d = sub(p, n);
          return d[d.length - 1];
        };
      }
      function orientation_4(sum, prod, scale, sub) {
        return function orientation4Exact2(m0, m1, m2, m3) {
          var p = sum(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m3[2]))), sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m3[2]))));
          var n = sum(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m3[2]))), sum(scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m2[2]))));
          var d = sub(p, n);
          return d[d.length - 1];
        };
      }
      function orientation_5(sum, prod, scale, sub) {
        return function orientation5Exact(m0, m1, m2, m3, m4) {
          var p = sum(sum(sum(scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m2[2]), sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), -m3[2]), scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m4[2]))), m1[3]), sum(scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m1[2]), sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), -m3[2]), scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m4[2]))), -m2[3]), scale(sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m4[2]))), m3[3]))), sum(scale(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m3[2]))), -m4[3]), sum(scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m1[2]), sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), -m3[2]), scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m4[2]))), m0[3]), scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m3[2]), scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), m4[2]))), -m1[3])))), sum(sum(scale(sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m4[2]))), m3[3]), sum(scale(sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m3[2]))), -m4[3]), scale(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m3[2]))), m0[3]))), sum(scale(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m3[2]))), -m1[3]), sum(scale(sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m3[2]))), m2[3]), scale(sum(scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m2[2]))), -m3[3])))));
          var n = sum(sum(sum(scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m2[2]), sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), -m3[2]), scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m4[2]))), m0[3]), scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m3[2]), scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), m4[2]))), -m2[3])), sum(scale(sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m4[2]))), m3[3]), scale(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m3[2]))), -m4[3]))), sum(sum(scale(sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m4[2]))), m0[3]), scale(sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m4[2]))), -m1[3])), sum(scale(sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m4[2]))), m2[3]), scale(sum(scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m2[2]))), -m4[3]))));
          var d = sub(p, n);
          return d[d.length - 1];
        };
      }
      function orientation(n) {
        var fn = n === 3 ? orientation_3 : n === 4 ? orientation_4 : orientation_5;
        return fn(robustSum, twoProduct, robustScale, robustSubtract);
      }
      var orientation3Exact = orientation(3);
      var orientation4Exact = orientation(4);
      var CACHED = [
        function orientation0() {
          return 0;
        },
        function orientation1() {
          return 0;
        },
        function orientation2(a, b) {
          return b[0] - a[0];
        },
        function orientation3(a, b, c) {
          var l = (a[1] - c[1]) * (b[0] - c[0]);
          var r = (a[0] - c[0]) * (b[1] - c[1]);
          var det = l - r;
          var s;
          if (l > 0) {
            if (r <= 0) {
              return det;
            } else {
              s = l + r;
            }
          } else if (l < 0) {
            if (r >= 0) {
              return det;
            } else {
              s = -(l + r);
            }
          } else {
            return det;
          }
          var tol = ERRBOUND3 * s;
          if (det >= tol || det <= -tol) {
            return det;
          }
          return orientation3Exact(a, b, c);
        },
        function orientation4(a, b, c, d) {
          var adx = a[0] - d[0];
          var bdx = b[0] - d[0];
          var cdx = c[0] - d[0];
          var ady = a[1] - d[1];
          var bdy = b[1] - d[1];
          var cdy = c[1] - d[1];
          var adz = a[2] - d[2];
          var bdz = b[2] - d[2];
          var cdz = c[2] - d[2];
          var bdxcdy = bdx * cdy;
          var cdxbdy = cdx * bdy;
          var cdxady = cdx * ady;
          var adxcdy = adx * cdy;
          var adxbdy = adx * bdy;
          var bdxady = bdx * ady;
          var det = adz * (bdxcdy - cdxbdy) + bdz * (cdxady - adxcdy) + cdz * (adxbdy - bdxady);
          var permanent = (Math.abs(bdxcdy) + Math.abs(cdxbdy)) * Math.abs(adz) + (Math.abs(cdxady) + Math.abs(adxcdy)) * Math.abs(bdz) + (Math.abs(adxbdy) + Math.abs(bdxady)) * Math.abs(cdz);
          var tol = ERRBOUND4 * permanent;
          if (det > tol || -det > tol) {
            return det;
          }
          return orientation4Exact(a, b, c, d);
        }
      ];
      function slowOrient(args) {
        var proc2 = CACHED[args.length];
        if (!proc2) {
          proc2 = CACHED[args.length] = orientation(args.length);
        }
        return proc2.apply(void 0, args);
      }
      function proc(slow, o0, o1, o2, o3, o4, o5) {
        return function getOrientation(a0, a1, a2, a3, a4) {
          switch (arguments.length) {
            case 0:
            case 1:
              return 0;
            case 2:
              return o2(a0, a1);
            case 3:
              return o3(a0, a1, a2);
            case 4:
              return o4(a0, a1, a2, a3);
            case 5:
              return o5(a0, a1, a2, a3, a4);
          }
          var s = new Array(arguments.length);
          for (var i = 0; i < arguments.length; ++i) {
            s[i] = arguments[i];
          }
          return slow(s);
        };
      }
      function generateOrientationProc() {
        while (CACHED.length <= NUM_EXPAND) {
          CACHED.push(orientation(CACHED.length));
        }
        module.exports = proc.apply(void 0, [slowOrient].concat(CACHED));
        for (var i = 0; i <= NUM_EXPAND; ++i) {
          module.exports[i] = CACHED[i];
        }
      }
      generateOrientationProc();
    }
  });

  // ../puppetry/web/node_modules/cdt2d/lib/monotone.js
  var require_monotone = __commonJS({
    "../puppetry/web/node_modules/cdt2d/lib/monotone.js"(exports, module) {
      "use strict";
      var bsearch = require_search_bounds();
      var orient = require_orientation()[3];
      var EVENT_POINT = 0;
      var EVENT_END = 1;
      var EVENT_START = 2;
      module.exports = monotoneTriangulate;
      function PartialHull(a, b, idx, lowerIds, upperIds) {
        this.a = a;
        this.b = b;
        this.idx = idx;
        this.lowerIds = lowerIds;
        this.upperIds = upperIds;
      }
      function Event(a, b, type, idx) {
        this.a = a;
        this.b = b;
        this.type = type;
        this.idx = idx;
      }
      function compareEvent(a, b) {
        var d = a.a[0] - b.a[0] || a.a[1] - b.a[1] || a.type - b.type;
        if (d) {
          return d;
        }
        if (a.type !== EVENT_POINT) {
          d = orient(a.a, a.b, b.b);
          if (d) {
            return d;
          }
        }
        return a.idx - b.idx;
      }
      function testPoint(hull, p) {
        return orient(hull.a, hull.b, p);
      }
      function addPoint(cells, hulls, points, p, idx) {
        var lo = bsearch.lt(hulls, p, testPoint);
        var hi = bsearch.gt(hulls, p, testPoint);
        for (var i = lo; i < hi; ++i) {
          var hull = hulls[i];
          var lowerIds = hull.lowerIds;
          var m = lowerIds.length;
          while (m > 1 && orient(
            points[lowerIds[m - 2]],
            points[lowerIds[m - 1]],
            p
          ) > 0) {
            cells.push(
              [
                lowerIds[m - 1],
                lowerIds[m - 2],
                idx
              ]
            );
            m -= 1;
          }
          lowerIds.length = m;
          lowerIds.push(idx);
          var upperIds = hull.upperIds;
          var m = upperIds.length;
          while (m > 1 && orient(
            points[upperIds[m - 2]],
            points[upperIds[m - 1]],
            p
          ) < 0) {
            cells.push(
              [
                upperIds[m - 2],
                upperIds[m - 1],
                idx
              ]
            );
            m -= 1;
          }
          upperIds.length = m;
          upperIds.push(idx);
        }
      }
      function findSplit(hull, edge) {
        var d;
        if (hull.a[0] < edge.a[0]) {
          d = orient(hull.a, hull.b, edge.a);
        } else {
          d = orient(edge.b, edge.a, hull.a);
        }
        if (d) {
          return d;
        }
        if (edge.b[0] < hull.b[0]) {
          d = orient(hull.a, hull.b, edge.b);
        } else {
          d = orient(edge.b, edge.a, hull.b);
        }
        return d || hull.idx - edge.idx;
      }
      function splitHulls(hulls, points, event) {
        var splitIdx = bsearch.le(hulls, event, findSplit);
        var hull = hulls[splitIdx];
        var upperIds = hull.upperIds;
        var x = upperIds[upperIds.length - 1];
        hull.upperIds = [x];
        hulls.splice(
          splitIdx + 1,
          0,
          new PartialHull(event.a, event.b, event.idx, [x], upperIds)
        );
      }
      function mergeHulls(hulls, points, event) {
        var tmp = event.a;
        event.a = event.b;
        event.b = tmp;
        var mergeIdx = bsearch.eq(hulls, event, findSplit);
        var upper = hulls[mergeIdx];
        var lower = hulls[mergeIdx - 1];
        lower.upperIds = upper.upperIds;
        hulls.splice(mergeIdx, 1);
      }
      function monotoneTriangulate(points, edges) {
        var numPoints = points.length;
        var numEdges = edges.length;
        var events = [];
        for (var i = 0; i < numPoints; ++i) {
          events.push(new Event(
            points[i],
            null,
            EVENT_POINT,
            i
          ));
        }
        for (var i = 0; i < numEdges; ++i) {
          var e = edges[i];
          var a = points[e[0]];
          var b = points[e[1]];
          if (a[0] < b[0]) {
            events.push(
              new Event(a, b, EVENT_START, i),
              new Event(b, a, EVENT_END, i)
            );
          } else if (a[0] > b[0]) {
            events.push(
              new Event(b, a, EVENT_START, i),
              new Event(a, b, EVENT_END, i)
            );
          }
        }
        events.sort(compareEvent);
        var minX = events[0].a[0] - (1 + Math.abs(events[0].a[0])) * Math.pow(2, -52);
        var hull = [new PartialHull([minX, 1], [minX, 0], -1, [], [], [], [])];
        var cells = [];
        for (var i = 0, numEvents = events.length; i < numEvents; ++i) {
          var event = events[i];
          var type = event.type;
          if (type === EVENT_POINT) {
            addPoint(cells, hull, points, event.a, event.idx);
          } else if (type === EVENT_START) {
            splitHulls(hull, points, event);
          } else {
            mergeHulls(hull, points, event);
          }
        }
        return cells;
      }
    }
  });

  // ../puppetry/web/node_modules/cdt2d/lib/triangulation.js
  var require_triangulation = __commonJS({
    "../puppetry/web/node_modules/cdt2d/lib/triangulation.js"(exports, module) {
      "use strict";
      var bsearch = require_search_bounds();
      module.exports = createTriangulation;
      function Triangulation(stars, edges) {
        this.stars = stars;
        this.edges = edges;
      }
      var proto = Triangulation.prototype;
      function removePair(list, j, k) {
        for (var i = 1, n = list.length; i < n; i += 2) {
          if (list[i - 1] === j && list[i] === k) {
            list[i - 1] = list[n - 2];
            list[i] = list[n - 1];
            list.length = n - 2;
            return;
          }
        }
      }
      proto.isConstraint = /* @__PURE__ */ (function() {
        var e = [0, 0];
        function compareLex(a, b) {
          return a[0] - b[0] || a[1] - b[1];
        }
        return function(i, j) {
          e[0] = Math.min(i, j);
          e[1] = Math.max(i, j);
          return bsearch.eq(this.edges, e, compareLex) >= 0;
        };
      })();
      proto.removeTriangle = function(i, j, k) {
        var stars = this.stars;
        removePair(stars[i], j, k);
        removePair(stars[j], k, i);
        removePair(stars[k], i, j);
      };
      proto.addTriangle = function(i, j, k) {
        var stars = this.stars;
        stars[i].push(j, k);
        stars[j].push(k, i);
        stars[k].push(i, j);
      };
      proto.opposite = function(j, i) {
        var list = this.stars[i];
        for (var k = 1, n = list.length; k < n; k += 2) {
          if (list[k] === j) {
            return list[k - 1];
          }
        }
        return -1;
      };
      proto.flip = function(i, j) {
        var a = this.opposite(i, j);
        var b = this.opposite(j, i);
        this.removeTriangle(i, j, a);
        this.removeTriangle(j, i, b);
        this.addTriangle(i, b, a);
        this.addTriangle(j, a, b);
      };
      proto.edges = function() {
        var stars = this.stars;
        var result = [];
        for (var i = 0, n = stars.length; i < n; ++i) {
          var list = stars[i];
          for (var j = 0, m = list.length; j < m; j += 2) {
            result.push([list[j], list[j + 1]]);
          }
        }
        return result;
      };
      proto.cells = function() {
        var stars = this.stars;
        var result = [];
        for (var i = 0, n = stars.length; i < n; ++i) {
          var list = stars[i];
          for (var j = 0, m = list.length; j < m; j += 2) {
            var s = list[j];
            var t = list[j + 1];
            if (i < Math.min(s, t)) {
              result.push([i, s, t]);
            }
          }
        }
        return result;
      };
      function createTriangulation(numVerts, edges) {
        var stars = new Array(numVerts);
        for (var i = 0; i < numVerts; ++i) {
          stars[i] = [];
        }
        return new Triangulation(stars, edges);
      }
    }
  });

  // ../puppetry/web/node_modules/robust-in-sphere/in-sphere.js
  var require_in_sphere = __commonJS({
    "../puppetry/web/node_modules/robust-in-sphere/in-sphere.js"(exports, module) {
      "use strict";
      var twoProduct = require_two_product();
      var robustSum = require_robust_sum();
      var robustDiff = require_robust_diff();
      var robustScale = require_robust_scale();
      var NUM_EXPAND = 6;
      function orientation(n) {
        var fn = n === 3 ? inSphere3 : n === 4 ? inSphere4 : n === 5 ? inSphere5 : inSphere6;
        return fn(robustSum, robustDiff, twoProduct, robustScale);
      }
      function inSphere0() {
        return 0;
      }
      function inSphere1() {
        return 0;
      }
      function inSphere2() {
        return 0;
      }
      function inSphere3(sum, diff, prod, scale) {
        function exactInSphere3(m0, m1, m2) {
          var w0 = prod(m0[0], m0[0]);
          var w0m1 = scale(w0, m1[0]);
          var w0m2 = scale(w0, m2[0]);
          var w1 = prod(m1[0], m1[0]);
          var w1m0 = scale(w1, m0[0]);
          var w1m2 = scale(w1, m2[0]);
          var w2 = prod(m2[0], m2[0]);
          var w2m0 = scale(w2, m0[0]);
          var w2m1 = scale(w2, m1[0]);
          var p = sum(diff(w2m1, w1m2), diff(w1m0, w0m1));
          var n = diff(w2m0, w0m2);
          var d = diff(p, n);
          return d[d.length - 1];
        }
        return exactInSphere3;
      }
      function inSphere4(sum, diff, prod, scale) {
        function exactInSphere4(m0, m1, m2, m3) {
          var w0 = sum(prod(m0[0], m0[0]), prod(m0[1], m0[1]));
          var w0m1 = scale(w0, m1[0]);
          var w0m2 = scale(w0, m2[0]);
          var w0m3 = scale(w0, m3[0]);
          var w1 = sum(prod(m1[0], m1[0]), prod(m1[1], m1[1]));
          var w1m0 = scale(w1, m0[0]);
          var w1m2 = scale(w1, m2[0]);
          var w1m3 = scale(w1, m3[0]);
          var w2 = sum(prod(m2[0], m2[0]), prod(m2[1], m2[1]));
          var w2m0 = scale(w2, m0[0]);
          var w2m1 = scale(w2, m1[0]);
          var w2m3 = scale(w2, m3[0]);
          var w3 = sum(prod(m3[0], m3[0]), prod(m3[1], m3[1]));
          var w3m0 = scale(w3, m0[0]);
          var w3m1 = scale(w3, m1[0]);
          var w3m2 = scale(w3, m2[0]);
          var p = sum(sum(scale(diff(w3m2, w2m3), m1[1]), sum(scale(diff(w3m1, w1m3), -m2[1]), scale(diff(w2m1, w1m2), m3[1]))), sum(scale(diff(w3m1, w1m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m1[1]), scale(diff(w1m0, w0m1), m3[1]))));
          var n = sum(sum(scale(diff(w3m2, w2m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m2[1]), scale(diff(w2m0, w0m2), m3[1]))), sum(scale(diff(w2m1, w1m2), m0[1]), sum(scale(diff(w2m0, w0m2), -m1[1]), scale(diff(w1m0, w0m1), m2[1]))));
          var d = diff(p, n);
          return d[d.length - 1];
        }
        return exactInSphere4;
      }
      function inSphere5(sum, diff, prod, scale) {
        function exactInSphere5(m0, m1, m2, m3, m4) {
          var w0 = sum(prod(m0[0], m0[0]), sum(prod(m0[1], m0[1]), prod(m0[2], m0[2])));
          var w0m1 = scale(w0, m1[0]);
          var w0m2 = scale(w0, m2[0]);
          var w0m3 = scale(w0, m3[0]);
          var w0m4 = scale(w0, m4[0]);
          var w1 = sum(prod(m1[0], m1[0]), sum(prod(m1[1], m1[1]), prod(m1[2], m1[2])));
          var w1m0 = scale(w1, m0[0]);
          var w1m2 = scale(w1, m2[0]);
          var w1m3 = scale(w1, m3[0]);
          var w1m4 = scale(w1, m4[0]);
          var w2 = sum(prod(m2[0], m2[0]), sum(prod(m2[1], m2[1]), prod(m2[2], m2[2])));
          var w2m0 = scale(w2, m0[0]);
          var w2m1 = scale(w2, m1[0]);
          var w2m3 = scale(w2, m3[0]);
          var w2m4 = scale(w2, m4[0]);
          var w3 = sum(prod(m3[0], m3[0]), sum(prod(m3[1], m3[1]), prod(m3[2], m3[2])));
          var w3m0 = scale(w3, m0[0]);
          var w3m1 = scale(w3, m1[0]);
          var w3m2 = scale(w3, m2[0]);
          var w3m4 = scale(w3, m4[0]);
          var w4 = sum(prod(m4[0], m4[0]), sum(prod(m4[1], m4[1]), prod(m4[2], m4[2])));
          var w4m0 = scale(w4, m0[0]);
          var w4m1 = scale(w4, m1[0]);
          var w4m2 = scale(w4, m2[0]);
          var w4m3 = scale(w4, m3[0]);
          var p = sum(sum(sum(scale(sum(scale(diff(w4m3, w3m4), m2[1]), sum(scale(diff(w4m2, w2m4), -m3[1]), scale(diff(w3m2, w2m3), m4[1]))), m1[2]), sum(scale(sum(scale(diff(w4m3, w3m4), m1[1]), sum(scale(diff(w4m1, w1m4), -m3[1]), scale(diff(w3m1, w1m3), m4[1]))), -m2[2]), scale(sum(scale(diff(w4m2, w2m4), m1[1]), sum(scale(diff(w4m1, w1m4), -m2[1]), scale(diff(w2m1, w1m2), m4[1]))), m3[2]))), sum(scale(sum(scale(diff(w3m2, w2m3), m1[1]), sum(scale(diff(w3m1, w1m3), -m2[1]), scale(diff(w2m1, w1m2), m3[1]))), -m4[2]), sum(scale(sum(scale(diff(w4m3, w3m4), m1[1]), sum(scale(diff(w4m1, w1m4), -m3[1]), scale(diff(w3m1, w1m3), m4[1]))), m0[2]), scale(sum(scale(diff(w4m3, w3m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m3[1]), scale(diff(w3m0, w0m3), m4[1]))), -m1[2])))), sum(sum(scale(sum(scale(diff(w4m1, w1m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m1[1]), scale(diff(w1m0, w0m1), m4[1]))), m3[2]), sum(scale(sum(scale(diff(w3m1, w1m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m1[1]), scale(diff(w1m0, w0m1), m3[1]))), -m4[2]), scale(sum(scale(diff(w3m2, w2m3), m1[1]), sum(scale(diff(w3m1, w1m3), -m2[1]), scale(diff(w2m1, w1m2), m3[1]))), m0[2]))), sum(scale(sum(scale(diff(w3m2, w2m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m2[1]), scale(diff(w2m0, w0m2), m3[1]))), -m1[2]), sum(scale(sum(scale(diff(w3m1, w1m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m1[1]), scale(diff(w1m0, w0m1), m3[1]))), m2[2]), scale(sum(scale(diff(w2m1, w1m2), m0[1]), sum(scale(diff(w2m0, w0m2), -m1[1]), scale(diff(w1m0, w0m1), m2[1]))), -m3[2])))));
          var n = sum(sum(sum(scale(sum(scale(diff(w4m3, w3m4), m2[1]), sum(scale(diff(w4m2, w2m4), -m3[1]), scale(diff(w3m2, w2m3), m4[1]))), m0[2]), scale(sum(scale(diff(w4m3, w3m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m3[1]), scale(diff(w3m0, w0m3), m4[1]))), -m2[2])), sum(scale(sum(scale(diff(w4m2, w2m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m2[1]), scale(diff(w2m0, w0m2), m4[1]))), m3[2]), scale(sum(scale(diff(w3m2, w2m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m2[1]), scale(diff(w2m0, w0m2), m3[1]))), -m4[2]))), sum(sum(scale(sum(scale(diff(w4m2, w2m4), m1[1]), sum(scale(diff(w4m1, w1m4), -m2[1]), scale(diff(w2m1, w1m2), m4[1]))), m0[2]), scale(sum(scale(diff(w4m2, w2m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m2[1]), scale(diff(w2m0, w0m2), m4[1]))), -m1[2])), sum(scale(sum(scale(diff(w4m1, w1m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m1[1]), scale(diff(w1m0, w0m1), m4[1]))), m2[2]), scale(sum(scale(diff(w2m1, w1m2), m0[1]), sum(scale(diff(w2m0, w0m2), -m1[1]), scale(diff(w1m0, w0m1), m2[1]))), -m4[2]))));
          var d = diff(p, n);
          return d[d.length - 1];
        }
        return exactInSphere5;
      }
      function inSphere6(sum, diff, prod, scale) {
        function exactInSphere6(m0, m1, m2, m3, m4, m5) {
          var w0 = sum(sum(prod(m0[0], m0[0]), prod(m0[1], m0[1])), sum(prod(m0[2], m0[2]), prod(m0[3], m0[3])));
          var w0m1 = scale(w0, m1[0]);
          var w0m2 = scale(w0, m2[0]);
          var w0m3 = scale(w0, m3[0]);
          var w0m4 = scale(w0, m4[0]);
          var w0m5 = scale(w0, m5[0]);
          var w1 = sum(sum(prod(m1[0], m1[0]), prod(m1[1], m1[1])), sum(prod(m1[2], m1[2]), prod(m1[3], m1[3])));
          var w1m0 = scale(w1, m0[0]);
          var w1m2 = scale(w1, m2[0]);
          var w1m3 = scale(w1, m3[0]);
          var w1m4 = scale(w1, m4[0]);
          var w1m5 = scale(w1, m5[0]);
          var w2 = sum(sum(prod(m2[0], m2[0]), prod(m2[1], m2[1])), sum(prod(m2[2], m2[2]), prod(m2[3], m2[3])));
          var w2m0 = scale(w2, m0[0]);
          var w2m1 = scale(w2, m1[0]);
          var w2m3 = scale(w2, m3[0]);
          var w2m4 = scale(w2, m4[0]);
          var w2m5 = scale(w2, m5[0]);
          var w3 = sum(sum(prod(m3[0], m3[0]), prod(m3[1], m3[1])), sum(prod(m3[2], m3[2]), prod(m3[3], m3[3])));
          var w3m0 = scale(w3, m0[0]);
          var w3m1 = scale(w3, m1[0]);
          var w3m2 = scale(w3, m2[0]);
          var w3m4 = scale(w3, m4[0]);
          var w3m5 = scale(w3, m5[0]);
          var w4 = sum(sum(prod(m4[0], m4[0]), prod(m4[1], m4[1])), sum(prod(m4[2], m4[2]), prod(m4[3], m4[3])));
          var w4m0 = scale(w4, m0[0]);
          var w4m1 = scale(w4, m1[0]);
          var w4m2 = scale(w4, m2[0]);
          var w4m3 = scale(w4, m3[0]);
          var w4m5 = scale(w4, m5[0]);
          var w5 = sum(sum(prod(m5[0], m5[0]), prod(m5[1], m5[1])), sum(prod(m5[2], m5[2]), prod(m5[3], m5[3])));
          var w5m0 = scale(w5, m0[0]);
          var w5m1 = scale(w5, m1[0]);
          var w5m2 = scale(w5, m2[0]);
          var w5m3 = scale(w5, m3[0]);
          var w5m4 = scale(w5, m4[0]);
          var p = sum(sum(sum(scale(sum(sum(scale(sum(scale(diff(w5m4, w4m5), m3[1]), sum(scale(diff(w5m3, w3m5), -m4[1]), scale(diff(w4m3, w3m4), m5[1]))), m2[2]), scale(sum(scale(diff(w5m4, w4m5), m2[1]), sum(scale(diff(w5m2, w2m5), -m4[1]), scale(diff(w4m2, w2m4), m5[1]))), -m3[2])), sum(scale(sum(scale(diff(w5m3, w3m5), m2[1]), sum(scale(diff(w5m2, w2m5), -m3[1]), scale(diff(w3m2, w2m3), m5[1]))), m4[2]), scale(sum(scale(diff(w4m3, w3m4), m2[1]), sum(scale(diff(w4m2, w2m4), -m3[1]), scale(diff(w3m2, w2m3), m4[1]))), -m5[2]))), m1[3]), sum(scale(sum(sum(scale(sum(scale(diff(w5m4, w4m5), m3[1]), sum(scale(diff(w5m3, w3m5), -m4[1]), scale(diff(w4m3, w3m4), m5[1]))), m1[2]), scale(sum(scale(diff(w5m4, w4m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m4[1]), scale(diff(w4m1, w1m4), m5[1]))), -m3[2])), sum(scale(sum(scale(diff(w5m3, w3m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m3[1]), scale(diff(w3m1, w1m3), m5[1]))), m4[2]), scale(sum(scale(diff(w4m3, w3m4), m1[1]), sum(scale(diff(w4m1, w1m4), -m3[1]), scale(diff(w3m1, w1m3), m4[1]))), -m5[2]))), -m2[3]), scale(sum(sum(scale(sum(scale(diff(w5m4, w4m5), m2[1]), sum(scale(diff(w5m2, w2m5), -m4[1]), scale(diff(w4m2, w2m4), m5[1]))), m1[2]), scale(sum(scale(diff(w5m4, w4m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m4[1]), scale(diff(w4m1, w1m4), m5[1]))), -m2[2])), sum(scale(sum(scale(diff(w5m2, w2m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m2[1]), scale(diff(w2m1, w1m2), m5[1]))), m4[2]), scale(sum(scale(diff(w4m2, w2m4), m1[1]), sum(scale(diff(w4m1, w1m4), -m2[1]), scale(diff(w2m1, w1m2), m4[1]))), -m5[2]))), m3[3]))), sum(sum(scale(sum(sum(scale(sum(scale(diff(w5m3, w3m5), m2[1]), sum(scale(diff(w5m2, w2m5), -m3[1]), scale(diff(w3m2, w2m3), m5[1]))), m1[2]), scale(sum(scale(diff(w5m3, w3m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m3[1]), scale(diff(w3m1, w1m3), m5[1]))), -m2[2])), sum(scale(sum(scale(diff(w5m2, w2m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m2[1]), scale(diff(w2m1, w1m2), m5[1]))), m3[2]), scale(sum(scale(diff(w3m2, w2m3), m1[1]), sum(scale(diff(w3m1, w1m3), -m2[1]), scale(diff(w2m1, w1m2), m3[1]))), -m5[2]))), -m4[3]), scale(sum(sum(scale(sum(scale(diff(w4m3, w3m4), m2[1]), sum(scale(diff(w4m2, w2m4), -m3[1]), scale(diff(w3m2, w2m3), m4[1]))), m1[2]), scale(sum(scale(diff(w4m3, w3m4), m1[1]), sum(scale(diff(w4m1, w1m4), -m3[1]), scale(diff(w3m1, w1m3), m4[1]))), -m2[2])), sum(scale(sum(scale(diff(w4m2, w2m4), m1[1]), sum(scale(diff(w4m1, w1m4), -m2[1]), scale(diff(w2m1, w1m2), m4[1]))), m3[2]), scale(sum(scale(diff(w3m2, w2m3), m1[1]), sum(scale(diff(w3m1, w1m3), -m2[1]), scale(diff(w2m1, w1m2), m3[1]))), -m4[2]))), m5[3])), sum(scale(sum(sum(scale(sum(scale(diff(w5m4, w4m5), m3[1]), sum(scale(diff(w5m3, w3m5), -m4[1]), scale(diff(w4m3, w3m4), m5[1]))), m1[2]), scale(sum(scale(diff(w5m4, w4m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m4[1]), scale(diff(w4m1, w1m4), m5[1]))), -m3[2])), sum(scale(sum(scale(diff(w5m3, w3m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m3[1]), scale(diff(w3m1, w1m3), m5[1]))), m4[2]), scale(sum(scale(diff(w4m3, w3m4), m1[1]), sum(scale(diff(w4m1, w1m4), -m3[1]), scale(diff(w3m1, w1m3), m4[1]))), -m5[2]))), m0[3]), scale(sum(sum(scale(sum(scale(diff(w5m4, w4m5), m3[1]), sum(scale(diff(w5m3, w3m5), -m4[1]), scale(diff(w4m3, w3m4), m5[1]))), m0[2]), scale(sum(scale(diff(w5m4, w4m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m4[1]), scale(diff(w4m0, w0m4), m5[1]))), -m3[2])), sum(scale(sum(scale(diff(w5m3, w3m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m3[1]), scale(diff(w3m0, w0m3), m5[1]))), m4[2]), scale(sum(scale(diff(w4m3, w3m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m3[1]), scale(diff(w3m0, w0m3), m4[1]))), -m5[2]))), -m1[3])))), sum(sum(sum(scale(sum(sum(scale(sum(scale(diff(w5m4, w4m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m4[1]), scale(diff(w4m1, w1m4), m5[1]))), m0[2]), scale(sum(scale(diff(w5m4, w4m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m4[1]), scale(diff(w4m0, w0m4), m5[1]))), -m1[2])), sum(scale(sum(scale(diff(w5m1, w1m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m1[1]), scale(diff(w1m0, w0m1), m5[1]))), m4[2]), scale(sum(scale(diff(w4m1, w1m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m1[1]), scale(diff(w1m0, w0m1), m4[1]))), -m5[2]))), m3[3]), scale(sum(sum(scale(sum(scale(diff(w5m3, w3m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m3[1]), scale(diff(w3m1, w1m3), m5[1]))), m0[2]), scale(sum(scale(diff(w5m3, w3m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m3[1]), scale(diff(w3m0, w0m3), m5[1]))), -m1[2])), sum(scale(sum(scale(diff(w5m1, w1m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m1[1]), scale(diff(w1m0, w0m1), m5[1]))), m3[2]), scale(sum(scale(diff(w3m1, w1m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m1[1]), scale(diff(w1m0, w0m1), m3[1]))), -m5[2]))), -m4[3])), sum(scale(sum(sum(scale(sum(scale(diff(w4m3, w3m4), m1[1]), sum(scale(diff(w4m1, w1m4), -m3[1]), scale(diff(w3m1, w1m3), m4[1]))), m0[2]), scale(sum(scale(diff(w4m3, w3m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m3[1]), scale(diff(w3m0, w0m3), m4[1]))), -m1[2])), sum(scale(sum(scale(diff(w4m1, w1m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m1[1]), scale(diff(w1m0, w0m1), m4[1]))), m3[2]), scale(sum(scale(diff(w3m1, w1m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m1[1]), scale(diff(w1m0, w0m1), m3[1]))), -m4[2]))), m5[3]), scale(sum(sum(scale(sum(scale(diff(w5m3, w3m5), m2[1]), sum(scale(diff(w5m2, w2m5), -m3[1]), scale(diff(w3m2, w2m3), m5[1]))), m1[2]), scale(sum(scale(diff(w5m3, w3m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m3[1]), scale(diff(w3m1, w1m3), m5[1]))), -m2[2])), sum(scale(sum(scale(diff(w5m2, w2m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m2[1]), scale(diff(w2m1, w1m2), m5[1]))), m3[2]), scale(sum(scale(diff(w3m2, w2m3), m1[1]), sum(scale(diff(w3m1, w1m3), -m2[1]), scale(diff(w2m1, w1m2), m3[1]))), -m5[2]))), m0[3]))), sum(sum(scale(sum(sum(scale(sum(scale(diff(w5m3, w3m5), m2[1]), sum(scale(diff(w5m2, w2m5), -m3[1]), scale(diff(w3m2, w2m3), m5[1]))), m0[2]), scale(sum(scale(diff(w5m3, w3m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m3[1]), scale(diff(w3m0, w0m3), m5[1]))), -m2[2])), sum(scale(sum(scale(diff(w5m2, w2m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m2[1]), scale(diff(w2m0, w0m2), m5[1]))), m3[2]), scale(sum(scale(diff(w3m2, w2m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m2[1]), scale(diff(w2m0, w0m2), m3[1]))), -m5[2]))), -m1[3]), scale(sum(sum(scale(sum(scale(diff(w5m3, w3m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m3[1]), scale(diff(w3m1, w1m3), m5[1]))), m0[2]), scale(sum(scale(diff(w5m3, w3m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m3[1]), scale(diff(w3m0, w0m3), m5[1]))), -m1[2])), sum(scale(sum(scale(diff(w5m1, w1m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m1[1]), scale(diff(w1m0, w0m1), m5[1]))), m3[2]), scale(sum(scale(diff(w3m1, w1m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m1[1]), scale(diff(w1m0, w0m1), m3[1]))), -m5[2]))), m2[3])), sum(scale(sum(sum(scale(sum(scale(diff(w5m2, w2m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m2[1]), scale(diff(w2m1, w1m2), m5[1]))), m0[2]), scale(sum(scale(diff(w5m2, w2m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m2[1]), scale(diff(w2m0, w0m2), m5[1]))), -m1[2])), sum(scale(sum(scale(diff(w5m1, w1m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m1[1]), scale(diff(w1m0, w0m1), m5[1]))), m2[2]), scale(sum(scale(diff(w2m1, w1m2), m0[1]), sum(scale(diff(w2m0, w0m2), -m1[1]), scale(diff(w1m0, w0m1), m2[1]))), -m5[2]))), -m3[3]), scale(sum(sum(scale(sum(scale(diff(w3m2, w2m3), m1[1]), sum(scale(diff(w3m1, w1m3), -m2[1]), scale(diff(w2m1, w1m2), m3[1]))), m0[2]), scale(sum(scale(diff(w3m2, w2m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m2[1]), scale(diff(w2m0, w0m2), m3[1]))), -m1[2])), sum(scale(sum(scale(diff(w3m1, w1m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m1[1]), scale(diff(w1m0, w0m1), m3[1]))), m2[2]), scale(sum(scale(diff(w2m1, w1m2), m0[1]), sum(scale(diff(w2m0, w0m2), -m1[1]), scale(diff(w1m0, w0m1), m2[1]))), -m3[2]))), m5[3])))));
          var n = sum(sum(sum(scale(sum(sum(scale(sum(scale(diff(w5m4, w4m5), m3[1]), sum(scale(diff(w5m3, w3m5), -m4[1]), scale(diff(w4m3, w3m4), m5[1]))), m2[2]), scale(sum(scale(diff(w5m4, w4m5), m2[1]), sum(scale(diff(w5m2, w2m5), -m4[1]), scale(diff(w4m2, w2m4), m5[1]))), -m3[2])), sum(scale(sum(scale(diff(w5m3, w3m5), m2[1]), sum(scale(diff(w5m2, w2m5), -m3[1]), scale(diff(w3m2, w2m3), m5[1]))), m4[2]), scale(sum(scale(diff(w4m3, w3m4), m2[1]), sum(scale(diff(w4m2, w2m4), -m3[1]), scale(diff(w3m2, w2m3), m4[1]))), -m5[2]))), m0[3]), sum(scale(sum(sum(scale(sum(scale(diff(w5m4, w4m5), m3[1]), sum(scale(diff(w5m3, w3m5), -m4[1]), scale(diff(w4m3, w3m4), m5[1]))), m0[2]), scale(sum(scale(diff(w5m4, w4m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m4[1]), scale(diff(w4m0, w0m4), m5[1]))), -m3[2])), sum(scale(sum(scale(diff(w5m3, w3m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m3[1]), scale(diff(w3m0, w0m3), m5[1]))), m4[2]), scale(sum(scale(diff(w4m3, w3m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m3[1]), scale(diff(w3m0, w0m3), m4[1]))), -m5[2]))), -m2[3]), scale(sum(sum(scale(sum(scale(diff(w5m4, w4m5), m2[1]), sum(scale(diff(w5m2, w2m5), -m4[1]), scale(diff(w4m2, w2m4), m5[1]))), m0[2]), scale(sum(scale(diff(w5m4, w4m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m4[1]), scale(diff(w4m0, w0m4), m5[1]))), -m2[2])), sum(scale(sum(scale(diff(w5m2, w2m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m2[1]), scale(diff(w2m0, w0m2), m5[1]))), m4[2]), scale(sum(scale(diff(w4m2, w2m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m2[1]), scale(diff(w2m0, w0m2), m4[1]))), -m5[2]))), m3[3]))), sum(sum(scale(sum(sum(scale(sum(scale(diff(w5m3, w3m5), m2[1]), sum(scale(diff(w5m2, w2m5), -m3[1]), scale(diff(w3m2, w2m3), m5[1]))), m0[2]), scale(sum(scale(diff(w5m3, w3m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m3[1]), scale(diff(w3m0, w0m3), m5[1]))), -m2[2])), sum(scale(sum(scale(diff(w5m2, w2m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m2[1]), scale(diff(w2m0, w0m2), m5[1]))), m3[2]), scale(sum(scale(diff(w3m2, w2m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m2[1]), scale(diff(w2m0, w0m2), m3[1]))), -m5[2]))), -m4[3]), scale(sum(sum(scale(sum(scale(diff(w4m3, w3m4), m2[1]), sum(scale(diff(w4m2, w2m4), -m3[1]), scale(diff(w3m2, w2m3), m4[1]))), m0[2]), scale(sum(scale(diff(w4m3, w3m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m3[1]), scale(diff(w3m0, w0m3), m4[1]))), -m2[2])), sum(scale(sum(scale(diff(w4m2, w2m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m2[1]), scale(diff(w2m0, w0m2), m4[1]))), m3[2]), scale(sum(scale(diff(w3m2, w2m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m2[1]), scale(diff(w2m0, w0m2), m3[1]))), -m4[2]))), m5[3])), sum(scale(sum(sum(scale(sum(scale(diff(w5m4, w4m5), m2[1]), sum(scale(diff(w5m2, w2m5), -m4[1]), scale(diff(w4m2, w2m4), m5[1]))), m1[2]), scale(sum(scale(diff(w5m4, w4m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m4[1]), scale(diff(w4m1, w1m4), m5[1]))), -m2[2])), sum(scale(sum(scale(diff(w5m2, w2m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m2[1]), scale(diff(w2m1, w1m2), m5[1]))), m4[2]), scale(sum(scale(diff(w4m2, w2m4), m1[1]), sum(scale(diff(w4m1, w1m4), -m2[1]), scale(diff(w2m1, w1m2), m4[1]))), -m5[2]))), m0[3]), scale(sum(sum(scale(sum(scale(diff(w5m4, w4m5), m2[1]), sum(scale(diff(w5m2, w2m5), -m4[1]), scale(diff(w4m2, w2m4), m5[1]))), m0[2]), scale(sum(scale(diff(w5m4, w4m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m4[1]), scale(diff(w4m0, w0m4), m5[1]))), -m2[2])), sum(scale(sum(scale(diff(w5m2, w2m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m2[1]), scale(diff(w2m0, w0m2), m5[1]))), m4[2]), scale(sum(scale(diff(w4m2, w2m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m2[1]), scale(diff(w2m0, w0m2), m4[1]))), -m5[2]))), -m1[3])))), sum(sum(sum(scale(sum(sum(scale(sum(scale(diff(w5m4, w4m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m4[1]), scale(diff(w4m1, w1m4), m5[1]))), m0[2]), scale(sum(scale(diff(w5m4, w4m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m4[1]), scale(diff(w4m0, w0m4), m5[1]))), -m1[2])), sum(scale(sum(scale(diff(w5m1, w1m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m1[1]), scale(diff(w1m0, w0m1), m5[1]))), m4[2]), scale(sum(scale(diff(w4m1, w1m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m1[1]), scale(diff(w1m0, w0m1), m4[1]))), -m5[2]))), m2[3]), scale(sum(sum(scale(sum(scale(diff(w5m2, w2m5), m1[1]), sum(scale(diff(w5m1, w1m5), -m2[1]), scale(diff(w2m1, w1m2), m5[1]))), m0[2]), scale(sum(scale(diff(w5m2, w2m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m2[1]), scale(diff(w2m0, w0m2), m5[1]))), -m1[2])), sum(scale(sum(scale(diff(w5m1, w1m5), m0[1]), sum(scale(diff(w5m0, w0m5), -m1[1]), scale(diff(w1m0, w0m1), m5[1]))), m2[2]), scale(sum(scale(diff(w2m1, w1m2), m0[1]), sum(scale(diff(w2m0, w0m2), -m1[1]), scale(diff(w1m0, w0m1), m2[1]))), -m5[2]))), -m4[3])), sum(scale(sum(sum(scale(sum(scale(diff(w4m2, w2m4), m1[1]), sum(scale(diff(w4m1, w1m4), -m2[1]), scale(diff(w2m1, w1m2), m4[1]))), m0[2]), scale(sum(scale(diff(w4m2, w2m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m2[1]), scale(diff(w2m0, w0m2), m4[1]))), -m1[2])), sum(scale(sum(scale(diff(w4m1, w1m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m1[1]), scale(diff(w1m0, w0m1), m4[1]))), m2[2]), scale(sum(scale(diff(w2m1, w1m2), m0[1]), sum(scale(diff(w2m0, w0m2), -m1[1]), scale(diff(w1m0, w0m1), m2[1]))), -m4[2]))), m5[3]), scale(sum(sum(scale(sum(scale(diff(w4m3, w3m4), m2[1]), sum(scale(diff(w4m2, w2m4), -m3[1]), scale(diff(w3m2, w2m3), m4[1]))), m1[2]), scale(sum(scale(diff(w4m3, w3m4), m1[1]), sum(scale(diff(w4m1, w1m4), -m3[1]), scale(diff(w3m1, w1m3), m4[1]))), -m2[2])), sum(scale(sum(scale(diff(w4m2, w2m4), m1[1]), sum(scale(diff(w4m1, w1m4), -m2[1]), scale(diff(w2m1, w1m2), m4[1]))), m3[2]), scale(sum(scale(diff(w3m2, w2m3), m1[1]), sum(scale(diff(w3m1, w1m3), -m2[1]), scale(diff(w2m1, w1m2), m3[1]))), -m4[2]))), m0[3]))), sum(sum(scale(sum(sum(scale(sum(scale(diff(w4m3, w3m4), m2[1]), sum(scale(diff(w4m2, w2m4), -m3[1]), scale(diff(w3m2, w2m3), m4[1]))), m0[2]), scale(sum(scale(diff(w4m3, w3m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m3[1]), scale(diff(w3m0, w0m3), m4[1]))), -m2[2])), sum(scale(sum(scale(diff(w4m2, w2m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m2[1]), scale(diff(w2m0, w0m2), m4[1]))), m3[2]), scale(sum(scale(diff(w3m2, w2m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m2[1]), scale(diff(w2m0, w0m2), m3[1]))), -m4[2]))), -m1[3]), scale(sum(sum(scale(sum(scale(diff(w4m3, w3m4), m1[1]), sum(scale(diff(w4m1, w1m4), -m3[1]), scale(diff(w3m1, w1m3), m4[1]))), m0[2]), scale(sum(scale(diff(w4m3, w3m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m3[1]), scale(diff(w3m0, w0m3), m4[1]))), -m1[2])), sum(scale(sum(scale(diff(w4m1, w1m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m1[1]), scale(diff(w1m0, w0m1), m4[1]))), m3[2]), scale(sum(scale(diff(w3m1, w1m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m1[1]), scale(diff(w1m0, w0m1), m3[1]))), -m4[2]))), m2[3])), sum(scale(sum(sum(scale(sum(scale(diff(w4m2, w2m4), m1[1]), sum(scale(diff(w4m1, w1m4), -m2[1]), scale(diff(w2m1, w1m2), m4[1]))), m0[2]), scale(sum(scale(diff(w4m2, w2m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m2[1]), scale(diff(w2m0, w0m2), m4[1]))), -m1[2])), sum(scale(sum(scale(diff(w4m1, w1m4), m0[1]), sum(scale(diff(w4m0, w0m4), -m1[1]), scale(diff(w1m0, w0m1), m4[1]))), m2[2]), scale(sum(scale(diff(w2m1, w1m2), m0[1]), sum(scale(diff(w2m0, w0m2), -m1[1]), scale(diff(w1m0, w0m1), m2[1]))), -m4[2]))), -m3[3]), scale(sum(sum(scale(sum(scale(diff(w3m2, w2m3), m1[1]), sum(scale(diff(w3m1, w1m3), -m2[1]), scale(diff(w2m1, w1m2), m3[1]))), m0[2]), scale(sum(scale(diff(w3m2, w2m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m2[1]), scale(diff(w2m0, w0m2), m3[1]))), -m1[2])), sum(scale(sum(scale(diff(w3m1, w1m3), m0[1]), sum(scale(diff(w3m0, w0m3), -m1[1]), scale(diff(w1m0, w0m1), m3[1]))), m2[2]), scale(sum(scale(diff(w2m1, w1m2), m0[1]), sum(scale(diff(w2m0, w0m2), -m1[1]), scale(diff(w1m0, w0m1), m2[1]))), -m3[2]))), m4[3])))));
          var d = diff(p, n);
          return d[d.length - 1];
        }
        return exactInSphere6;
      }
      var CACHED = [
        inSphere0,
        inSphere1,
        inSphere2
      ];
      function slowInSphere(args) {
        var proc2 = CACHED[args.length];
        if (!proc2) {
          proc2 = CACHED[args.length] = orientation(args.length);
        }
        return proc2.apply(void 0, args);
      }
      function proc(slow, o0, o1, o2, o3, o4, o5, o6) {
        function testInSphere(a0, a1, a2, a3, a4, a5) {
          switch (arguments.length) {
            case 0:
            case 1:
              return 0;
            case 2:
              return o2(a0, a1);
            case 3:
              return o3(a0, a1, a2);
            case 4:
              return o4(a0, a1, a2, a3);
            case 5:
              return o5(a0, a1, a2, a3, a4);
            case 6:
              return o6(a0, a1, a2, a3, a4, a5);
          }
          var s = new Array(arguments.length);
          for (var i = 0; i < arguments.length; ++i) {
            s[i] = arguments[i];
          }
          return slow(s);
        }
        return testInSphere;
      }
      function generateInSphereTest() {
        while (CACHED.length <= NUM_EXPAND) {
          CACHED.push(orientation(CACHED.length));
        }
        module.exports = proc.apply(void 0, [slowInSphere].concat(CACHED));
        for (var i = 0; i <= NUM_EXPAND; ++i) {
          module.exports[i] = CACHED[i];
        }
      }
      generateInSphereTest();
    }
  });

  // ../puppetry/web/node_modules/cdt2d/lib/delaunay.js
  var require_delaunay = __commonJS({
    "../puppetry/web/node_modules/cdt2d/lib/delaunay.js"(exports, module) {
      "use strict";
      var inCircle = require_in_sphere()[4];
      var bsearch = require_search_bounds();
      module.exports = delaunayRefine;
      function testFlip(points, triangulation, stack, a, b, x) {
        var y = triangulation.opposite(a, b);
        if (y < 0) {
          return;
        }
        if (b < a) {
          var tmp = a;
          a = b;
          b = tmp;
          tmp = x;
          x = y;
          y = tmp;
        }
        if (triangulation.isConstraint(a, b)) {
          return;
        }
        if (inCircle(points[a], points[b], points[x], points[y]) < 0) {
          stack.push(a, b);
        }
      }
      function delaunayRefine(points, triangulation) {
        var stack = [];
        var numPoints = points.length;
        var stars = triangulation.stars;
        for (var a = 0; a < numPoints; ++a) {
          var star = stars[a];
          for (var j = 1; j < star.length; j += 2) {
            var b = star[j];
            if (b < a) {
              continue;
            }
            if (triangulation.isConstraint(a, b)) {
              continue;
            }
            var x = star[j - 1], y = -1;
            for (var k = 1; k < star.length; k += 2) {
              if (star[k - 1] === b) {
                y = star[k];
                break;
              }
            }
            if (y < 0) {
              continue;
            }
            if (inCircle(points[a], points[b], points[x], points[y]) < 0) {
              stack.push(a, b);
            }
          }
        }
        while (stack.length > 0) {
          var b = stack.pop();
          var a = stack.pop();
          var x = -1, y = -1;
          var star = stars[a];
          for (var i = 1; i < star.length; i += 2) {
            var s = star[i - 1];
            var t = star[i];
            if (s === b) {
              y = t;
            } else if (t === b) {
              x = s;
            }
          }
          if (x < 0 || y < 0) {
            continue;
          }
          if (inCircle(points[a], points[b], points[x], points[y]) >= 0) {
            continue;
          }
          triangulation.flip(a, b);
          testFlip(points, triangulation, stack, x, a, y);
          testFlip(points, triangulation, stack, a, y, x);
          testFlip(points, triangulation, stack, y, b, x);
          testFlip(points, triangulation, stack, b, x, y);
        }
      }
    }
  });

  // ../puppetry/web/node_modules/cdt2d/lib/filter.js
  var require_filter = __commonJS({
    "../puppetry/web/node_modules/cdt2d/lib/filter.js"(exports, module) {
      "use strict";
      var bsearch = require_search_bounds();
      module.exports = classifyFaces;
      function FaceIndex(cells, neighbor, constraint, flags, active, next, boundary) {
        this.cells = cells;
        this.neighbor = neighbor;
        this.flags = flags;
        this.constraint = constraint;
        this.active = active;
        this.next = next;
        this.boundary = boundary;
      }
      var proto = FaceIndex.prototype;
      function compareCell(a, b) {
        return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
      }
      proto.locate = /* @__PURE__ */ (function() {
        var key = [0, 0, 0];
        return function(a, b, c) {
          var x = a, y = b, z = c;
          if (b < c) {
            if (b < a) {
              x = b;
              y = c;
              z = a;
            }
          } else if (c < a) {
            x = c;
            y = a;
            z = b;
          }
          if (x < 0) {
            return -1;
          }
          key[0] = x;
          key[1] = y;
          key[2] = z;
          return bsearch.eq(this.cells, key, compareCell);
        };
      })();
      function indexCells(triangulation, infinity) {
        var cells = triangulation.cells();
        var nc = cells.length;
        for (var i = 0; i < nc; ++i) {
          var c = cells[i];
          var x = c[0], y = c[1], z = c[2];
          if (y < z) {
            if (y < x) {
              c[0] = y;
              c[1] = z;
              c[2] = x;
            }
          } else if (z < x) {
            c[0] = z;
            c[1] = x;
            c[2] = y;
          }
        }
        cells.sort(compareCell);
        var flags = new Array(nc);
        for (var i = 0; i < flags.length; ++i) {
          flags[i] = 0;
        }
        var active = [];
        var next = [];
        var neighbor = new Array(3 * nc);
        var constraint = new Array(3 * nc);
        var boundary = null;
        if (infinity) {
          boundary = [];
        }
        var index = new FaceIndex(
          cells,
          neighbor,
          constraint,
          flags,
          active,
          next,
          boundary
        );
        for (var i = 0; i < nc; ++i) {
          var c = cells[i];
          for (var j = 0; j < 3; ++j) {
            var x = c[j], y = c[(j + 1) % 3];
            var a = neighbor[3 * i + j] = index.locate(y, x, triangulation.opposite(y, x));
            var b = constraint[3 * i + j] = triangulation.isConstraint(x, y);
            if (a < 0) {
              if (b) {
                next.push(i);
              } else {
                active.push(i);
                flags[i] = 1;
              }
              if (infinity) {
                boundary.push([y, x, -1]);
              }
            }
          }
        }
        return index;
      }
      function filterCells(cells, flags, target) {
        var ptr = 0;
        for (var i = 0; i < cells.length; ++i) {
          if (flags[i] === target) {
            cells[ptr++] = cells[i];
          }
        }
        cells.length = ptr;
        return cells;
      }
      function classifyFaces(triangulation, target, infinity) {
        var index = indexCells(triangulation, infinity);
        if (target === 0) {
          if (infinity) {
            return index.cells.concat(index.boundary);
          } else {
            return index.cells;
          }
        }
        var side = 1;
        var active = index.active;
        var next = index.next;
        var flags = index.flags;
        var cells = index.cells;
        var constraint = index.constraint;
        var neighbor = index.neighbor;
        while (active.length > 0 || next.length > 0) {
          while (active.length > 0) {
            var t = active.pop();
            if (flags[t] === -side) {
              continue;
            }
            flags[t] = side;
            var c = cells[t];
            for (var j = 0; j < 3; ++j) {
              var f = neighbor[3 * t + j];
              if (f >= 0 && flags[f] === 0) {
                if (constraint[3 * t + j]) {
                  next.push(f);
                } else {
                  active.push(f);
                  flags[f] = side;
                }
              }
            }
          }
          var tmp = next;
          next = active;
          active = tmp;
          next.length = 0;
          side = -side;
        }
        var result = filterCells(cells, flags, target);
        if (infinity) {
          return result.concat(index.boundary);
        }
        return result;
      }
    }
  });

  // ../puppetry/web/node_modules/cdt2d/cdt2d.js
  var require_cdt2d = __commonJS({
    "../puppetry/web/node_modules/cdt2d/cdt2d.js"(exports, module) {
      "use strict";
      var monotoneTriangulate = require_monotone();
      var makeIndex = require_triangulation();
      var delaunayFlip = require_delaunay();
      var filterTriangulation = require_filter();
      module.exports = cdt2d2;
      function canonicalizeEdge(e) {
        return [Math.min(e[0], e[1]), Math.max(e[0], e[1])];
      }
      function compareEdge(a, b) {
        return a[0] - b[0] || a[1] - b[1];
      }
      function canonicalizeEdges(edges) {
        return edges.map(canonicalizeEdge).sort(compareEdge);
      }
      function getDefault(options, property, dflt) {
        if (property in options) {
          return options[property];
        }
        return dflt;
      }
      function cdt2d2(points, edges, options) {
        if (!Array.isArray(edges)) {
          options = edges || {};
          edges = [];
        } else {
          options = options || {};
          edges = edges || [];
        }
        var delaunay = !!getDefault(options, "delaunay", true);
        var interior = !!getDefault(options, "interior", true);
        var exterior = !!getDefault(options, "exterior", true);
        var infinity = !!getDefault(options, "infinity", false);
        if (!interior && !exterior || points.length === 0) {
          return [];
        }
        var cells = monotoneTriangulate(points, edges);
        if (delaunay || interior !== exterior || infinity) {
          var triangulation = makeIndex(points.length, canonicalizeEdges(edges));
          for (var i = 0; i < cells.length; ++i) {
            var f = cells[i];
            triangulation.addTriangle(f[0], f[1], f[2]);
          }
          if (delaunay) {
            delaunayFlip(points, triangulation);
          }
          if (!exterior) {
            return filterTriangulation(triangulation, -1);
          } else if (!interior) {
            return filterTriangulation(triangulation, 1, infinity);
          } else if (infinity) {
            return filterTriangulation(triangulation, 0, infinity);
          } else {
            return triangulation.cells();
          }
        } else {
          return cells;
        }
      }
    }
  });

  // src/arap-p5-core.js
  var arap_p5_core_exports = {};
  __export(arap_p5_core_exports, {
    ArapShape: () => ArapShape,
    initialize: () => initialize,
    setWasmUrl: () => setWasmUrl,
    utils: () => utils
  });
  var import_cdt2d = __toESM(require_cdt2d());
  var DRAW_SAMPLE_SPACING = 4;
  var DEFAULT_WASM_FILE = "arap2d_bg.wasm";
  var RESOLUTION_PRESETS = [
    {
      name: "low",
      subdivisions: 0,
      douglasPeuckerEpsilon: 7,
      boundaryMaxSegment: 34,
      maxBoundaryPoints: 48,
      interiorSpacingScale: 1.45
    },
    {
      name: "medium",
      subdivisions: 1,
      douglasPeuckerEpsilon: 5,
      boundaryMaxSegment: 24,
      maxBoundaryPoints: 96,
      interiorSpacingScale: 1
    }
  ];
  var libraryScriptUrl = (() => {
    if (typeof document === "undefined") return null;
    if (document.currentScript?.src) return document.currentScript.src;
    const scripts = [...document.querySelectorAll("script[src]")];
    const ownScript = scripts.reverse().find((script) => /arap-p5(?:\.min)?\.js(?:[?#].*)?$/.test(script.src));
    return ownScript?.src || null;
  })();
  var configuredWasmUrl = null;
  var wasmReadyPromise = null;
  function toPoint(pointOrX, y) {
    if (Array.isArray(pointOrX)) return { x: Number(pointOrX[0]), y: Number(pointOrX[1]) };
    if (typeof pointOrX === "object" && pointOrX !== null) {
      return { x: Number(pointOrX.x), y: Number(pointOrX.y) };
    }
    return { x: Number(pointOrX), y: Number(y) };
  }
  function toPointList(points) {
    return points.map((point) => toPoint(point));
  }
  function defaultWasmUrl() {
    if (!libraryScriptUrl) return DEFAULT_WASM_FILE;
    return new URL(DEFAULT_WASM_FILE, libraryScriptUrl).toString();
  }
  function setWasmUrl(url) {
    configuredWasmUrl = url;
    wasmReadyPromise = null;
  }
  async function initialize(options = {}) {
    if (options.wasmUrl) setWasmUrl(options.wasmUrl);
    if (wasmReadyPromise) return wasmReadyPromise;
    const loader = globalThis.wasm_bindgen;
    if (typeof loader !== "function") {
      throw new Error("ArapP5 could not find wasm_bindgen. Make sure arap-p5.js is loaded before sketch.js.");
    }
    const wasmUrl = configuredWasmUrl || defaultWasmUrl();
    wasmReadyPromise = Promise.resolve(loader({ module_or_path: wasmUrl })).then(() => loader);
    try {
      return await wasmReadyPromise;
    } catch (error) {
      wasmReadyPromise = null;
      throw error;
    }
  }
  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }
  function interpolate(a, b, t) {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t
    };
  }
  function polygonArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      area += a.x * b.y - b.x * a.y;
    }
    return area * 0.5;
  }
  function positiveShell(points) {
    return polygonArea(points) < 0 ? points.slice().reverse() : points;
  }
  function removeClosingDuplicate(points, epsilon = 1) {
    if (points.length > 2 && dist(points[0], points[points.length - 1]) <= epsilon) {
      return points.slice(0, -1);
    }
    return points;
  }
  function dedupeConsecutivePoints(points, epsilon = 0.5) {
    const out = [];
    for (const p of points) {
      if (!out.length || dist(out[out.length - 1], p) > epsilon) out.push(p);
    }
    return removeClosingDuplicate(out, epsilon);
  }
  function densifyClosedPath(points, spacing) {
    if (points.length < 2) return points;
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const length = dist(a, b);
      const steps = Math.max(1, Math.ceil(length / spacing));
      out.push(a);
      for (let step = 1; step < steps; step++) out.push(interpolate(a, b, step / steps));
    }
    return out;
  }
  function perpendicularDistanceToSegment(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq < 1e-9) return dist(p, a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
    return dist(p, { x: a.x + dx * t, y: a.y + dy * t });
  }
  function douglasPeuckerOpen(points, epsilon) {
    if (points.length <= 2) return points;
    let maxDistance = -1;
    let splitIndex = 0;
    const first = points[0];
    const last = points[points.length - 1];
    for (let i = 1; i < points.length - 1; i++) {
      const d = perpendicularDistanceToSegment(points[i], first, last);
      if (d > maxDistance) {
        maxDistance = d;
        splitIndex = i;
      }
    }
    if (maxDistance <= epsilon) return [first, last];
    const left = douglasPeuckerOpen(points.slice(0, splitIndex + 1), epsilon);
    const right = douglasPeuckerOpen(points.slice(splitIndex), epsilon);
    return left.slice(0, -1).concat(right);
  }
  function polygonCentroid(points) {
    let area2 = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const cross = a.x * b.y - b.x * a.y;
      area2 += cross;
      cx += (a.x + b.x) * cross;
      cy += (a.y + b.y) * cross;
    }
    if (Math.abs(area2) < 1e-7) {
      return {
        x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
        y: points.reduce((sum, p) => sum + p.y, 0) / points.length
      };
    }
    return { x: cx / (3 * area2), y: cy / (3 * area2) };
  }
  function douglasPeuckerClosed(points, epsilon) {
    if (points.length <= 3) return points;
    const center = polygonCentroid(points);
    let startIndex = 0;
    let startDistance = -1;
    points.forEach((p, i) => {
      const d = dist(p, center);
      if (d > startDistance) {
        startDistance = d;
        startIndex = i;
      }
    });
    const rotated = points.slice(startIndex).concat(points.slice(0, startIndex));
    const simplified = douglasPeuckerOpen([...rotated, rotated[0]], epsilon);
    const closed = removeClosingDuplicate(simplified, 1e-6);
    return closed.length >= 3 ? closed : points;
  }
  function removeNearCollinear(points, epsilon = 0.015) {
    if (points.length < 4) return points;
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[(i - 1 + points.length) % points.length];
      const curr = points[i];
      const next = points[(i + 1) % points.length];
      const ux = curr.x - prev.x;
      const uy = curr.y - prev.y;
      const vx = next.x - curr.x;
      const vy = next.y - curr.y;
      const cross = Math.abs(ux * vy - uy * vx);
      const scale = Math.max(1, Math.hypot(ux, uy) * Math.hypot(vx, vy));
      if (cross / scale > epsilon || dist(prev, next) < 1) out.push(curr);
    }
    return out.length >= 3 ? out : points;
  }
  function subdivideLongBoundarySegments(points, maxSegmentLength, maxPoints) {
    if (points.length < 2) return points;
    const out = [];
    const perimeter = points.reduce((sum, p, i) => sum + dist(p, points[(i + 1) % points.length]), 0);
    const scale = Math.max(1, perimeter / (maxSegmentLength * maxPoints));
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const steps = Math.max(1, Math.ceil(dist(a, b) / (maxSegmentLength * scale)));
      out.push(a);
      for (let step = 1; step < steps; step++) out.push(interpolate(a, b, step / steps));
    }
    return out;
  }
  function simplifyBoundary(points, preset) {
    const cleaned = dedupeConsecutivePoints(points);
    if (cleaned.length < 3) return cleaned;
    const dense = densifyClosedPath(cleaned, DRAW_SAMPLE_SPACING);
    const simplified = removeNearCollinear(douglasPeuckerClosed(dense, preset.douglasPeuckerEpsilon));
    return subdivideLongBoundarySegments(simplified, preset.boundaryMaxSegment, preset.maxBoundaryPoints);
  }
  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i];
      const b = polygon[j];
      if (a.y > point.y !== b.y > point.y) {
        const x = (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x;
        if (point.x < x) inside = !inside;
      }
    }
    return inside;
  }
  function distanceToBoundary(point, boundary) {
    let best = Infinity;
    for (let i = 0; i < boundary.length; i++) {
      best = Math.min(best, perpendicularDistanceToSegment(point, boundary[i], boundary[(i + 1) % boundary.length]));
    }
    return best;
  }
  function boundaryBounds(boundary) {
    return boundary.reduce(
      (box, p) => ({
        minX: Math.min(box.minX, p.x),
        minY: Math.min(box.minY, p.y),
        maxX: Math.max(box.maxX, p.x),
        maxY: Math.max(box.maxY, p.y)
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );
  }
  function interiorSampleSpacing(boundary, preset) {
    const area = Math.max(1, Math.abs(polygonArea(boundary)));
    return Math.max(30, Math.min(68, Math.sqrt(area) / 6 * preset.interiorSpacingScale));
  }
  function addUniqueVertex(vertices, point, epsilon = 1e-6) {
    for (let i = 0; i < vertices.length; i++) {
      if (dist(vertices[i], point) <= epsilon) return i;
    }
    vertices.push({ x: point.x, y: point.y });
    return vertices.length - 1;
  }
  function addInteriorSamples(vertices, boundary, preset) {
    const box = boundaryBounds(boundary);
    const spacing = interiorSampleSpacing(boundary, preset);
    const rowHeight = spacing * Math.sqrt(3) * 0.5;
    const clearance = spacing * 0.38;
    let row = 0;
    for (let y = box.minY + rowHeight * 0.5; y <= box.maxY - rowHeight * 0.25; y += rowHeight) {
      const offset = row % 2 === 0 ? spacing * 0.5 : 0;
      for (let x = box.minX + offset; x <= box.maxX; x += spacing) {
        const p = { x, y };
        if (pointInPolygon(p, boundary) && distanceToBoundary(p, boundary) > clearance) {
          addUniqueVertex(vertices, p, 0.5);
        }
      }
      row += 1;
    }
  }
  function buildControlMesh(boundary, preset, extraPoints) {
    const vertices = boundary.map((p) => ({ x: p.x, y: p.y }));
    const boundaryCount = vertices.length;
    for (const p of extraPoints) {
      if (pointInPolygon(p, boundary) || distanceToBoundary(p, boundary) <= 1) {
        addUniqueVertex(vertices, p, 0.5);
      }
    }
    addInteriorSamples(vertices, boundary, preset);
    const points = vertices.map((p) => [p.x, p.y]);
    const edges = boundary.map((_, i) => [i, (i + 1) % boundary.length]);
    const triangles = (0, import_cdt2d.default)(points, edges, { exterior: false, delaunay: true });
    return { vertices, triangles, polygon: boundary, boundaryCount };
  }
  function edgeKey(a, b) {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }
  function buildEdgeInfo(triangles) {
    const edges = /* @__PURE__ */ new Map();
    triangles.forEach((tri) => {
      for (const [a, b, opposite] of [
        [tri[0], tri[1], tri[2]],
        [tri[1], tri[2], tri[0]],
        [tri[2], tri[0], tri[1]]
      ]) {
        const key = edgeKey(a, b);
        if (!edges.has(key)) edges.set(key, { a: Math.min(a, b), b: Math.max(a, b), opposites: [] });
        edges.get(key).opposites.push(opposite);
      }
    });
    const boundaryNeighbors = /* @__PURE__ */ new Map();
    for (const edge of edges.values()) {
      if (edge.opposites.length !== 1) continue;
      if (!boundaryNeighbors.has(edge.a)) boundaryNeighbors.set(edge.a, []);
      if (!boundaryNeighbors.has(edge.b)) boundaryNeighbors.set(edge.b, []);
      boundaryNeighbors.get(edge.a).push(edge.b);
      boundaryNeighbors.get(edge.b).push(edge.a);
    }
    return { edges, boundaryNeighbors };
  }
  function oppositeAcross(edges, a, b, exclude) {
    const edge = edges.get(edgeKey(a, b));
    if (!edge) return null;
    return edge.opposites.find((idx) => idx !== exclude) ?? null;
  }
  function addScaled(out, point, scale) {
    out.x += point.x * scale;
    out.y += point.y * scale;
  }
  function boundaryButterflyPoint(vertices, boundaryNeighbors, a, b) {
    const va = vertices[a];
    const vb = vertices[b];
    const prev = (boundaryNeighbors.get(a) || []).find((idx) => idx !== b);
    const next = (boundaryNeighbors.get(b) || []).find((idx) => idx !== a);
    if (prev == null || next == null) return { x: (va.x + vb.x) * 0.5, y: (va.y + vb.y) * 0.5 };
    const vp = vertices[prev];
    const vn = vertices[next];
    return {
      x: (9 * va.x + 9 * vb.x - vp.x - vn.x) / 16,
      y: (9 * va.y + 9 * vb.y - vp.y - vn.y) / 16
    };
  }
  function butterflyPoint(vertices, topology, a, b) {
    const { edges, boundaryNeighbors } = topology;
    const edge = edges.get(edgeKey(a, b));
    const va = vertices[a];
    const vb = vertices[b];
    if (!edge || edge.opposites.length !== 2) return boundaryButterflyPoint(vertices, boundaryNeighbors, a, b);
    const [c, d] = edge.opposites;
    const outer = [
      oppositeAcross(edges, a, c, b),
      oppositeAcross(edges, b, c, a),
      oppositeAcross(edges, a, d, b),
      oppositeAcross(edges, b, d, a)
    ];
    if (outer.some((idx) => idx == null)) return { x: (va.x + vb.x) * 0.5, y: (va.y + vb.y) * 0.5 };
    const out = { x: 0, y: 0 };
    addScaled(out, va, 0.5);
    addScaled(out, vb, 0.5);
    addScaled(out, vertices[c], 0.125);
    addScaled(out, vertices[d], 0.125);
    outer.forEach((idx) => addScaled(out, vertices[idx], -0.0625));
    return out;
  }
  function butterflySubdivision(mesh, iterations = 1) {
    let vertices = mesh.vertices.map((p) => ({ x: p.x, y: p.y }));
    let triangles = mesh.triangles.map((tri) => [...tri]);
    let boundaryCount = mesh.boundaryCount;
    for (let iteration = 0; iteration < iterations; iteration++) {
      const topology = buildEdgeInfo(triangles);
      const edgeVertices = /* @__PURE__ */ new Map();
      const nextVertices = vertices.map((p) => ({ x: p.x, y: p.y }));
      const getEdgeVertex = (a, b) => {
        const key = edgeKey(a, b);
        if (!edgeVertices.has(key)) {
          edgeVertices.set(key, nextVertices.length);
          nextVertices.push(butterflyPoint(vertices, topology, a, b));
        }
        return edgeVertices.get(key);
      };
      const nextTriangles = [];
      for (const [a, b, c] of triangles) {
        const ab = getEdgeVertex(a, b);
        const bc = getEdgeVertex(b, c);
        const ca = getEdgeVertex(c, a);
        nextTriangles.push([a, ab, ca]);
        nextTriangles.push([ab, b, bc]);
        nextTriangles.push([ca, bc, c]);
        nextTriangles.push([ab, bc, ca]);
      }
      vertices = nextVertices;
      triangles = nextTriangles;
    }
    return { vertices, triangles, polygon: mesh.polygon, boundaryCount };
  }
  function resolutionPreset(resolution) {
    if (typeof resolution === "string") {
      const found = RESOLUTION_PRESETS.find((preset) => preset.name === resolution.toLowerCase());
      if (found) return found;
    }
    const index = Math.max(0, Math.min(RESOLUTION_PRESETS.length - 1, Math.round(Number(resolution) || 0)));
    return RESOLUTION_PRESETS[index];
  }
  function triangulatePolygon(rawPath, options = {}) {
    const preset = resolutionPreset(options.resolution ?? 1);
    const boundary = positiveShell(simplifyBoundary(toPointList(rawPath), preset));
    if (boundary.length < 3) throw new Error("ArapShape needs at least three boundary vertices.");
    const controlMesh = buildControlMesh(boundary, preset, options.extraPoints || []);
    const mesh = butterflySubdivision(controlMesh, preset.subdivisions);
    mesh.sourcePath = toPointList(rawPath);
    mesh.resolutionName = preset.name;
    return mesh;
  }
  function flattenVertices(vertices) {
    const data = new Float64Array(vertices.length * 2);
    vertices.forEach((p, i) => {
      data[2 * i] = p.x;
      data[2 * i + 1] = p.y;
    });
    return data;
  }
  function flattenTriangles(triangles) {
    const data = new Uint32Array(triangles.length * 3);
    triangles.forEach((tri, i) => {
      data[3 * i] = tri[0];
      data[3 * i + 1] = tri[1];
      data[3 * i + 2] = tri[2];
    });
    return data;
  }
  function nearestIndexIn(vertices, point, used = null) {
    let best = null;
    let bestDistance = Infinity;
    vertices.forEach((p, index) => {
      if (used?.has(index)) return;
      const d = dist(point, p);
      if (d < bestDistance) {
        bestDistance = d;
        best = index;
      }
    });
    return best;
  }
  function clonePoint(p) {
    return { x: p.x, y: p.y };
  }
  var ArapShape = class {
    constructor(boundaryVertices, options = {}) {
      this.boundaryVertices = toPointList(boundaryVertices);
      this.options = { resolution: options.resolution ?? 1, scaleAdjust: options.scaleAdjust ?? true };
      this.pins = [];
      this.controls = [];
      this.mesh = null;
      this.deformed = [];
      this.solver = null;
      this.constrained = [];
      this.dirtySolver = true;
      for (const pin of options.pins || []) this.addPin(pin);
      for (const control of options.controls || []) this.addControl(control);
    }
    addPin(pointOrX, y) {
      const point = toPoint(pointOrX, y);
      this.pins.push({ rest: point, meshIndex: null });
      this.dirtySolver = true;
      return this.pins.length - 1;
    }
    addControl(pointOrX, y) {
      const point = toPoint(pointOrX, y);
      this.controls.push({ rest: point, target: clonePoint(point), meshIndex: null });
      this.dirtySolver = true;
      return this.controls.length - 1;
    }
    async build(options = {}) {
      Object.assign(this.options, options);
      await initialize(options);
      const extraPoints = [...this.pins.map((pin) => pin.rest), ...this.controls.map((control) => control.rest)];
      this.mesh = triangulatePolygon(this.boundaryVertices, {
        resolution: this.options.resolution,
        extraPoints
      });
      const used = /* @__PURE__ */ new Set();
      for (const pin of this.pins) {
        pin.meshIndex = nearestIndexIn(this.mesh.vertices, pin.rest, used);
        if (pin.meshIndex != null) used.add(pin.meshIndex);
      }
      for (const control of this.controls) {
        control.meshIndex = nearestIndexIn(this.mesh.vertices, control.rest, used);
        if (control.meshIndex != null) used.add(control.meshIndex);
      }
      this.deformed = this.mesh.vertices.map(clonePoint);
      this.dirtySolver = true;
      this.update();
      return this;
    }
    rebuild(options = {}) {
      return this.build(options);
    }
    async setResolution(resolution) {
      this.options.resolution = resolution;
      if (!this.mesh) return this;
      return this.rebuild();
    }
    setBoundary(boundaryVertices) {
      this.boundaryVertices = toPointList(boundaryVertices);
      this.mesh = null;
      this.solver = null;
      this.dirtySolver = true;
    }
    moveControl(index, pointOrX, y) {
      const control = this.controls[index];
      if (!control) throw new Error(`No control exists at index ${index}.`);
      control.target = toPoint(pointOrX, y);
      this.update();
    }
    setControl(index, pointOrX, y) {
      this.moveControl(index, pointOrX, y);
    }
    resetControls() {
      for (const control of this.controls) control.target = clonePoint(control.rest);
      this.update();
    }
    compileSolver() {
      if (!this.mesh) throw new Error("Call build() before deforming an ArapShape.");
      const constrained = [
        ...this.pins.map((pin) => pin.meshIndex),
        ...this.controls.map((control) => control.meshIndex)
      ].filter((idx) => idx != null);
      this.constrained = [...new Set(constrained)].sort((a, b) => a - b);
      if (this.constrained.length < 2) {
        this.solver = null;
        return false;
      }
      const WasmArap = globalThis.wasm_bindgen?.WasmArap;
      if (!WasmArap) throw new Error("ArapP5 has not initialized its WebAssembly solver.");
      this.solver = new WasmArap(
        flattenVertices(this.mesh.vertices),
        flattenTriangles(this.mesh.triangles),
        new Uint32Array(this.constrained)
      );
      this.dirtySolver = false;
      return true;
    }
    targetForMeshIndex(meshIndex) {
      for (const pin of this.pins) {
        if (pin.meshIndex === meshIndex) return this.mesh.vertices[meshIndex];
      }
      for (const control of this.controls) {
        if (control.meshIndex === meshIndex) return control.target;
      }
      return this.mesh.vertices[meshIndex];
    }
    update() {
      if (!this.mesh) return;
      if (this.dirtySolver && !this.compileSolver()) {
        this.deformed = this.mesh.vertices.map(clonePoint);
        return;
      }
      if (!this.solver) {
        this.deformed = this.mesh.vertices.map(clonePoint);
        return;
      }
      const targets = new Float64Array(this.constrained.length * 2);
      this.constrained.forEach((meshIndex, i) => {
        const p = this.targetForMeshIndex(meshIndex);
        targets[2 * i] = p.x;
        targets[2 * i + 1] = p.y;
      });
      const result = this.solver.deform(targets, this.options.scaleAdjust);
      this.deformed = [];
      for (let i = 0; i < result.length; i += 2) this.deformed.push({ x: result[i], y: result[i + 1] });
    }
    getBoundary(options = {}) {
      if (!this.mesh) return this.boundaryVertices.map(clonePoint);
      const source = options.rest ? this.mesh.vertices : this.deformed;
      return source.slice(0, this.mesh.boundaryCount).map(clonePoint);
    }
    getRestBoundary() {
      return this.getBoundary({ rest: true });
    }
    getMesh() {
      if (!this.mesh) return null;
      return {
        vertices: this.mesh.vertices.map(clonePoint),
        deformedVertices: this.deformed.map(clonePoint),
        triangles: this.mesh.triangles.map((tri) => [...tri]),
        boundaryCount: this.mesh.boundaryCount,
        resolution: this.mesh.resolutionName
      };
    }
    drawDebug(p5OrOptions = globalThis, maybeOptions = {}) {
      if (!this.mesh) return;
      const looksLikeP5 = p5OrOptions && typeof p5OrOptions.triangle === "function";
      const p = looksLikeP5 ? p5OrOptions : globalThis;
      const options = looksLikeP5 ? maybeOptions : p5OrOptions || {};
      if (typeof p.triangle !== "function") {
        throw new Error("ArapShape.drawDebug() needs p5 drawing functions. Use drawDebug() in global mode or drawDebug(this) in instance mode.");
      }
      const strokeColor = options.stroke ?? [60, 120, 180, 80];
      const strokeWeight = options.strokeWeight ?? 1;
      if (typeof p.push === "function") p.push();
      if (typeof p.noFill === "function") p.noFill();
      if (typeof p.stroke === "function") {
        Array.isArray(strokeColor) ? p.stroke(...strokeColor) : p.stroke(strokeColor);
      }
      if (typeof p.strokeWeight === "function") p.strokeWeight(strokeWeight);
      for (const tri of this.mesh.triangles) {
        const a = this.deformed[tri[0]];
        const b = this.deformed[tri[1]];
        const c = this.deformed[tri[2]];
        p.triangle(a.x, a.y, b.x, b.y, c.x, c.y);
      }
      if (typeof p.pop === "function") p.pop();
    }
    getPins() {
      return this.pins.map((pin, index) => ({
        index,
        meshIndex: pin.meshIndex,
        rest: clonePoint(pin.rest),
        x: pin.rest.x,
        y: pin.rest.y
      }));
    }
    getControls() {
      return this.controls.map((control, index) => ({
        index,
        meshIndex: control.meshIndex,
        rest: clonePoint(control.rest),
        target: clonePoint(control.target),
        x: control.target.x,
        y: control.target.y
      }));
    }
    nearestControl(pointOrX, y, maxDistance = 18) {
      const point = toPoint(pointOrX, y);
      let best = -1;
      let bestDistance = maxDistance;
      this.controls.forEach((control, index) => {
        const d = dist(point, control.target);
        if (d < bestDistance) {
          bestDistance = d;
          best = index;
        }
      });
      return best;
    }
  };
  var utils = {
    distance: dist,
    pointInPolygon
  };
  return __toCommonJS(arap_p5_core_exports);
})();

