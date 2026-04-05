# Plottimation Tool

[This tool](https://golanlevin.github.io/plottimation/) builds a looping animation from a photograph of a plotted frame-sheet.<br/>
Version 1.09 • By @GolanLevin, 2026.

* [**Plottimation Tool Online Here**](https://golanlevin.github.io/plottimation/)
* [**Quickstart Instructions**](#quickstart-instructions)
* [Design Templates](templates/README.md) • [Demo Video](https://www.youtube.com/watch?v=MOXB63DgItQ) • [Documentation](documentation.md) 
• [Gallery](#plottimation-gif-gallery)

![plottimation_ui.png](doc/plottimation_spinnyrect.gif)

## Quickstart Instructions

1. **Create** a "frame sheet" of your animation. Your sheet should contain a grid of frames separated by small crosses `+` or filled circular dots `●`, and it should have no markings in the margins.
2. **Photograph** or scan your frame sheet. It's ok to use a casual photo — but your sheet should be completely surrounded by a uniform dark background, as shown in [this example](demo/1_dmawer_crosses.jpg).
3. **Open** the [**Plottimation Tool**](https://golanlevin.github.io/plottimation/) in a browser, from [here](https://golanlevin.github.io/plottimation).
4. **Load** the image of your frame sheet into the Plottimation Tool. You can do this by dragging your image file onto the Tool's load target (where it says "Drop a photo or scan here"), or by clicking the target to load a file. As an alternative, you can click `Load Demo` instead.
5. Under the *Layout* tab, **set** `Frame Columns` and `Frame Rows` to match the layout of your sheet's grid of frames. You should also set your sheet's orientation (landscape or portrait) and page size (11×8.5, etc.).
6. On the "Raw Photo" panel, you should see a green line around your page. If the panel shows a warning symbol ⚠️, or if there is no green line around your sheet, or if the green line is incorrect, you may need to **adjust** the thresholding settings in the *Page & Grid Detection* tab. Try experimenting with the "Thresholding Offset" slider first. 
7. According to your taste, **adjust** the settings under the *Appearance* and *Crop & Geometry* tabs. Changes to these settings are reflected in the animation shown in the *Preview* panel.
8. To generate and download your GIF animation, **click** `Export GIF`. You can also download your animation as an MP4 movie or a folder of frames. There are advanced settings in the *Export Options* tab for adjusting output dimensions, compression quality, and playback modes.

---

## Plottimation GIF Gallery

<img src="doc/plotti_demo_2.gif" height="200"> <img src="doc/plotti_demo_4.gif" height="200"> 

