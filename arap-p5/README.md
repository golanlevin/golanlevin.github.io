# ARAP p5.js Wrapper

This folder contains a p5-friendly wrapper around Kyle McDonald's clean-room
2D as-rigid-as-possible solver.

For a sketch, load these files before `sketch.js`:

```html
<script src="p5.js"></script>
<script src="arap-p5.js"></script>
<script src="sketch.js"></script>
```

Serve `arap2d_bg.wasm` beside `arap-p5.js`. If the files are hosted somewhere
else, configure the WASM URL before building shapes:

```js
ArapP5.setWasmUrl("https://golanlevin.github.io/arap-p5/arap2d_bg.wasm");
```

## Basic API

```js
let shape = new ArapP5.ArapShape(myShapeVertices);
shape.setResolution("medium");
shape.addPin(200, 325);
shape.addControl(300, 75);
shape.addControl(100, 75);
await shape.build();

shape.moveControl(0, mouseX, mouseY);

let boundary = shape.getBoundary();
beginShape();
for (let p of boundary) {
  vertex(p.x, p.y);
}
endShape(CLOSE);

shape.drawDebug();
```

Pins and controls are specified with `[x, y]`, `{ x, y }`, or separate `x, y`
arguments. They are inserted into the triangulation when possible and then
snapped to the nearest mesh vertex.

If the shape is already built, use `await shape.setResolution("low")` or
`await shape.setResolution("medium")` to rebuild the mesh.

Useful methods:

- `addPin(x, y)`
- `addControl(x, y)`
- `build()`
- `setResolution("low")` or `setResolution("medium")`
- `moveControl(index, x, y)`
- `resetControls()`
- `nearestControl(x, y, maxDistance)`
- `getBoundary()`
- `getRestBoundary()`
- `getControls()`
- `getPins()`
- `getMesh()`
- `drawDebug()`

`getMesh()` returns deformed vertices and triangles for debugging or mesh
drawing. `drawDebug()` draws just the deformed triangle mesh with p5. In p5
instance mode, call `shape.drawDebug(this)`.

## Rebuilding

From `arap/puppetry/web`, run `npm install` once. From `arap/puppetry`, build
the WASM solver:

```sh
cargo build -p arap2d --target wasm32-unknown-unknown --release
```

Then generate the wasm-bindgen package into this folder:

```sh
wasm-bindgen --target no-modules --out-dir ../arap-p5/pkg --out-name arap2d target/wasm32-unknown-unknown/release/arap2d.wasm
```

Finally, from this folder:

```sh
node build.mjs
```

To verify the browser integration:

```sh
node arap/arap-p5/verify-playwright.js
```
