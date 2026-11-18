/*
About this project
**Axis** (2002: Golan Levin) is a whimsical interactive data visualization,
commissioned by the Whitney Museum for its Artport website. A dozen artists
were invited by curator Christiane Paul to respond to a specific assignment
in a programming language of their choice. The assignment was to 'connect
and move three points in space,' which obviously could be interpreted in a
literal or abstract way. The code itself was not to exceed 8 kilobytes,
which equals a fairly short text document. My contribution, *Axis*, is an
interactive applet driven by a simple database of arcane sociopolitical 
factoids. The project responds to Paul's challenge by allowing its users to
connect three countries into a conceptual "Axis" defined by their common
properties in this database. 
*/ 


/*
AxisApplet by Golan Levin
http://www.flong.com/
15 August 2002.

Ported to p5.js v.1.11.11, January 2026.

-------------------------
"An Axis can't have more than three countries," explained Iraqi President
Saddam Hussein. "This is not my rule, it's tradition. In World War II you
had Germany, Italy, and Japan in the evil Axis. So you can only have three.
And a secret handshake. Ours is wicked cool."[1]

President Bush's recent assertion that North Korea, Iraq and Iran form an
"Axis of Evil"[2] was more than a calculated political act -- it was also
an imaginatively formal, geometric one, which had the effect of erecting a
monumental, virtual, globe-spanning triangle.

Axis is an online tool intended to broaden opportunities for similar kinds
of Axis creation. It allows its participant to connect any three points in
space [countries] into a new Axis of his or her own design. With the help
of multidimensional statistical metrics culled from international public
databases[3], the commonalities amongst the user's choices are revealed.
In this manner, Axis presents an inversion of Bush's praxis, obtaining
lexico-political meaning from the formal act of spatial selection.

-------------------------
References:
[1] "Angered by Snubbing, Libya, China, Syria Form 'Axis of Just as Evil'".
    SatireWire, 1/30/2002. http://www.satirewire.com/news/jan02/axis.shtml
[2] "In Speech, Bush Calls Iraq, Iran and North Korea 'Axis of Evil'".
    State of the Union Address, 1/29/2002.
[3] The databases referenced in this project are listed at the
    end of this document.
*/

// Constants
const FF = 255;
const BASE = 72;
const PDEC = 8;
const NCOL = 256;
const IW = 919;
const IH = 476;
const IY = 64;
const APP_W = 919;
const APP_H = IH + IY;
const AXI_W = Math.floor(APP_W * 2 / 3);

// Image and pixel data
let srcImg;
let srcArray;  // Stores country IDs from the indexed image

// Palette arrays (current colors for each country ID)
let palr, palg, palb;
let curr, curg, curb;

// State variables
let whichSel = [-1, -1, -1];
let highlites;
let curCtryID = 0;
let nSelectedCountries = 0;

// Floating indicator box
let bxf, byf;
const bxa = 0.36;
const bxb = 1.0 - bxa;
const bya = 0.29;
const byb = 1.0 - bya;
let bx, by, bw, bh = 20;

// Text strings
let axisStr = "";
let ctryStr = "";
let liteStr = "";
let axisStr2 = "";
let iCh = ['', '', ''];
let doText = true;

// Colors
let colb, col1, col2, colu;

// Decoded property data (boolean arrays)
let countryProps = [];

function preload() {
  srcImg = loadImage("world.png");
}

function setup() {
  createCanvas(APP_W, APP_H);
  pixelDensity(1); 

  // Set up colors
  colb = color(102, 102, 102);
  col1 = color(72, 72, 72);
  col2 = color(60, 60, 60);

  // Decode property data from base-64
  decodePropertyData();

  // Extract country IDs from the indexed image
  srcImg.loadPixels();
  srcArray = new Int32Array(IW * IH);
  for (let i = 0; i < IW * IH; i++) {
    let idx = i * 4;
    let r = srcImg.pixels[idx];
    let g = srcImg.pixels[idx + 1];
    let b = srcImg.pixels[idx + 2];

    // Check for black (boundary/ocean)
    if (r === 0 && g === 0 && b === 0) {
      srcArray[i] = 255;  // No country
    } else {
      srcArray[i] = b;  // Blue channel is country index
    }
  }

  // Initialize palette arrays
  palr = new Int32Array(NCOL);
  palg = new Int32Array(NCOL);
  palb = new Int32Array(NCOL);
  curr = new Int32Array(NCOL);
  curg = new Int32Array(NCOL);
  curb = new Int32Array(NCOL);

  // Construct the base color palette
  for (let i = 0; i < NCOL; i++) {
    let fi = i / (NCOL - 1);
    curr[i] = curg[i] = curb[i] = 0;
    palr[i] = Math.floor(BASE + 40.0 * Math.pow(fi, 9.0));
    palg[i] = Math.floor(BASE + 80.0 * Math.pow(fi, 6.0));
    palb[i] = Math.floor(BASE + 120.0 * Math.pow(fi, 3.0));
  }

  // Set the highlight color
  colu = color(palr[NCOL-1], palg[NCOL-1], palb[NCOL-1]);

  // Initialize highlight array
  highlites = new Int32Array(nCountries);
  for (let i = 0; i < nCountries; i++) {
    highlites[i] = 0;
  }

  // Initialize box position
  bxf = APP_W / 2;
  byf = APP_H / 2;

  // Set up text
  textFont("Arial");
}

function draw() {
  compute();
  render();
}

function compute() {
  highlightCountryAtCursor(mouseX, mouseY);

  // Update the current palette based on highlight values
  for (let i = 0; i < nCountries; i++) {
    let vali = highlites[i] = Math.max(0, highlites[i] - PDEC);
    curr[i] = palr[vali];
    curg[i] = palg[vali];
    curb[i] = palb[vali];
  }

  // Flash the selected countries yellow
  let which;
  let nSelected = 0;
  for (let i = 0; i < 3; i++) {
    which = whichSel[i];
    if (which >= 0 && which < nCountries) {
      curr[which] = curg[which] = FF;
      curb[which] = 0;
      nSelected++;
    }
  }

  // Construct the displayed texts
  ctryStr = "";
  nSelectedCountries = nSelected;
  if (nSelected > 0) {
    // Start with all bits set, then AND with each country's properties
    let comProps = new Array(nProperties).fill(true);

    for (let i = nSelected - 1; i >= 0; i--) {
      which = whichSel[i];
      if (which >= 0 && which < nCountries) {
        ctryStr += countryNames[which] + (i > 0 ? ", " : " :  ");
        // Intersect properties
        for (let p = 0; p < nProperties; p++) {
          comProps[p] = comProps[p] && countryProps[which][p];
        }
        iCh[i] = countryNames[which].charAt(0);
      }
    }

    // Assemble the axis string
    if (doText) {
      // Count common properties
      let nProps = 0;
      for (let p = 0; p < nProperties; p++) {
        if (comProps[p]) nProps++;
      }

      // Use grammatical rules to make something sensible
      axisStr2 = axisStr = "";
      if (nSelected === 3) {
        let initial = (iCh[0] === iCh[1]) && (iCh[1] === iCh[2]);
        if (nProps > 0) {
          axisStr = "Axis of ";
          let prop = 0;
          let wordy = false;

          for (let b = 0; b < nProperties; b++) {
            if (comProps[b]) {
              let pnb = propNames[b];
              if (nProps === 1 && propAdjs[b] > 0) {
                axisStr += "the " + pnb;
                if (initial) axisStr += letStr + iCh[0];
                axisStr += ".";
              } else {
                textSize(11);
                let strw = textWidth(axisStr + pnb);
                if (++prop < nProps) {
                  if (wordy || strw > AXI_W) {
                    axisStr2 += pnb;
                    if (propVerbs[b] > 0) axisStr2 += "ing";
                    axisStr2 += nProps > 2 ? ", " : " ";
                    wordy = true;
                  } else {
                    axisStr += pnb;
                    if (propVerbs[b] > 0) axisStr += "ing";
                    axisStr += nProps > 2 ? ", " : " ";
                  }
                } else {
                  if (wordy || strw > AXI_W) {
                    axisStr2 += pnb;
                    axisStr2 += propVerbs[b] > 0 ? "ers" : " countries";
                    if (initial) axisStr2 += letStr + iCh[0];
                    axisStr2 += ".";
                  } else {
                    axisStr += pnb;
                    axisStr += propVerbs[b] > 0 ? "ers" : " countries";
                    if (initial) axisStr += letStr + iCh[0];
                    axisStr += ".";
                  }
                }
              }
            }
          }
        } else {
          if (initial) {
            axisStr = "Axis of countries" + letStr + iCh[0] + ".";
          } else {
            axisStr = "These countries have not yet registered their Axis.";
          }
        }
      }
    }
    doText = false;
  }

  // Construct the floating indicator box position
  textSize(12);
  bw = Math.max(Math.floor(textWidth(liteStr)) + 12, 24);
  bxf = bxa * bxf + bxb * (mouseX > bw + 20 ? mouseX - bw - 20 : mouseX + 20);
  byf = bya * byf + byb * (mouseY - bh / 2);
  bx = Math.round(bxf);
  by = Math.round(byf);
}

function render() {
  // Draw the header area
  noStroke();
  fill(colb);
  rect(0, 0, APP_W, IY);

  // Draw the world map with animated palette
  loadPixels();
  for (let y = 0; y < IH; y++) {
    for (let x = 0; x < IW; x++) {
      let srcIndex = y * IW + x;
      let dstIndex = ((y + IY) * width + x) * 4;
      let ctryID = srcArray[srcIndex];
      if (ctryID < NCOL) {
        pixels[dstIndex] = curr[ctryID];
        pixels[dstIndex + 1] = curg[ctryID];
        pixels[dstIndex + 2] = curb[ctryID];
        pixels[dstIndex + 3] = 255;
      } else {
        pixels[dstIndex] = 0;
        pixels[dstIndex + 1] = 0;
        pixels[dstIndex + 2] = 0;
        pixels[dstIndex + 3] = 255;
      }
    }
  }
  updatePixels();

  // Draw border around the map
  stroke(0);
  noFill();
  rect(0, IY - 1, IW - 1, IH);

  // Draw the list of countries
  textSize(14);
  textStyle(BOLD);
  fill(col2);
  text(ctryStr, 11, 22);
  fill(nSelectedCountries === 3 ? color(255, 255, 0) : color(128));
  text(ctryStr, 10, 21);

  // Draw the axis string
  textSize(11);
  textStyle(NORMAL);
  fill(col2);
  text(axisStr, 11, 38);
  text(axisStr2, 11, 54);
  fill(255, 255, 0);
  text(axisStr, 10, 37);
  text(axisStr2, 10, 53);

  // Draw the floating indicator box
  if (liteStr !== "" && mouseY >= IY) {
    fill(colb);
    stroke(0);
    rect(bx, by, bw, bh);

    if (whichSel[0] === curCtryID ||
        whichSel[1] === curCtryID ||
        whichSel[2] === curCtryID) {
      fill(255, 255, 0);
    } else {
      fill(colu);
    }
    textSize(12);
    textStyle(BOLD);
    text(liteStr, bx + 6, by + bh - 5);
  }
}

function mousePressed() {
  selectCountryAtCursor(mouseX, mouseY);
}

function selectCountryAtCursor(x, y) {
  if (x >= 0 && x < APP_W && y >= IY && y < APP_H) {
    let csrIndex = (y - IY) * IW + x;
    if (csrIndex < IW * IH && csrIndex >= 0) {
      let ctryID = srcArray[csrIndex] & 0xFF;
      if (ctryID >= 0 && ctryID < nCountries) {
        if (ctryID !== whichSel[0] &&
            ctryID !== whichSel[1] &&
            ctryID !== whichSel[2]) {
          whichSel[2] = whichSel[1];
          whichSel[1] = whichSel[0];
          whichSel[0] = curCtryID = ctryID;
        }
      } else {
        ctryStr = axisStr2 = axisStr = liteStr = "";
        if (whichSel[0] > -1) highlites[whichSel[0]] = FF;
        if (whichSel[1] > -1) highlites[whichSel[1]] = FF;
        if (whichSel[2] > -1) highlites[whichSel[2]] = FF;
        whichSel[0] = whichSel[1] = whichSel[2] = -1;
      }
    }
  }
}

function highlightCountryAtCursor(x, y) {
  doText = true;
  if (x >= 0 && x < APP_W && y >= IY && y < APP_H) {
    let csrIndex = (y - IY) * IW + x;
    if (csrIndex < IW * IH && csrIndex >= 0) {
      let ctryID = srcArray[csrIndex] & 0xFF;
      if (ctryID >= 0 && ctryID < nCountries) {
        highlites[curCtryID = ctryID] = FF;
        liteStr = countryNames[curCtryID];
      } else {
        liteStr = "";
      }
    }
  } else {
    liteStr = "";
  }
}

// =========================================================================
// Decode base-64 property data into boolean arrays
// =========================================================================
function decodePropertyData() {
  for (let i = 0; i < nCountries; i++) {
    countryProps[i] = decodeBase64Props(countryPropsB64[i]);
  }
}

function decodeBase64Props(b64str) {
  // Decode base-64 to bytes
  let binary = atob(b64str);
  let bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  // Extract bits into boolean array
  let props = new Array(nProperties);
  for (let i = 0; i < nProperties; i++) {
    let byteIndex = Math.floor(i / 8);
    let bitIndex = i % 8;
    props[i] = (bytes[byteIndex] & (1 << bitIndex)) !== 0;
  }
  return props;
}

// =========================================================================
// DATABASE: Country names
// =========================================================================
const countryNames = [
  "United States of America", "Canada", "Mexico", "Guatemala", "Cuba", "Haiti", "Dominican Republic", "Belize",
  "Honduras", "Nicaragua", "Costa Rica", "Panama", "Colombia", "Venezuela", "Guyana", "Suriname",
  "French Guyana", "Ecuador", "Peru", "Bolivia", "Chile", "Argentina", "Uruguay", "Andorra",
  "Paraguay", "Brazil", "Morocco", "Armenia", "Mauritania", "Senegal", "Gambia", "Guinea-Bissau",
  "Guinea", "Sierra Leone", "Liberia", "Cote d'Ivoire", "Ghana", "Togo", "Benin", "Nigeria",
  "Cameroon", "Equatorial Guinea", "Gabon", "Republic of the Congo",
  "Democratic Republic of Congo", "Angola", "Namibia", "South Africa",
  "Mozambique", "Tanzania", "Kenya", "Somalia", "Ethiopia", "Sudan", "Egypt", "Libya",
  "Tunisia", "Algeria", "Mali", "Burkina Faso", "Niger", "Chad", "Central African Republic", "Uganda",
  "Rwanda", "Burundi", "Zambia", "Malawi", "Zimbabwe", "Botswana", "Swaziland", "Lesotho",
  "Madagascar", "Greece", "Albania", "Yugoslavia", "Italy", "Spain", "Portugal", "France",
  "United Kingdom", "Ireland", "Azerbaijan", "Belgium", "Netherlands", "Denmark", "Germany", "Switzerland",
  "Austria", "Hungary", "Czech Republic", "Poland", "Sweden", "Norway", "Finland", "Romania",
  "Bulgaria", "Turkey", "Syria", "Israel", "Jordan", "Iraq", "Bahrain", "Kuwait",
  "Saudi Arabia", "Belarus", "Yemen", "Oman", "United Arab Emirates", "Iran", "Afghanistan", "Pakistan",
  "India", "Sri Lanka", "Nepal", "Bosnia and Herzegovina", "Bhutan", "Bangladesh", "Croatia", "Cyprus",
  "Burma", "Thailand", "Laos", "Cambodia", "Vietnam", "Off-By-One Error", "Malaysia", "Singapore",
  "Indonesia", "Djibouti", "Brunei", "El Salvador", "Hong Kong", "Eritrea", "Estonia", "Philippines",
  "Georgia", "Papua New Guinea", "Australia", "Gibraltar", "New Zealand", "China", "North Korea", "South Korea",
  "Mongolia", "Japan", "Russia", "Greenland", "Iceland", "Kazakhstan", "Kyrgyzstan", "Latvia",
  "Lebanon", "Liechtenstein", "Lithuania", "Luxembourg", "Macedonia", "Moldova",
  "Monaco", "Qatar", "Slovak Republic", "Slovenia", "Taiwan", "Tajikistan", "Turkmenistan",
  "Ukraine", "Uzbekistan", "Antigua and Barbuda", "Bahamas", "Barbados", "Bermuda", "Cape Verde",
  "Dominica", "Grenada", "Guadeloupe", "Guam", "Jamaica", "Malta", "Mauritius", "New Caledonia", "Palau",
  "Puerto Rico", "Reunion", "Seychelles", "Trinidad and Tobago"
];

const letStr = " whose names start with the letter ";
const nCountries = countryNames.length;

// =========================================================================
// DATABASE: Property names
// =========================================================================
const propNames = [
  "itsy-bitsy", "small", "huge", "densely-populated",
  "sparsely-populated", "long and skinny", "peninsular", "island-dwell",
  "landlocked", "rainy", "arid", "cloudy",
  "earthquake-prone", "officially polylingual", "officially Anglophone", "Portuguese-speak",
  "politically or territorially dependent", "largely illiterate", "heavily-indebted and poor", "monarchic",
  "dictatorially autocratic", "communist", "Slavic", "predominantly Muslim",
  "predominantly Catholic", "predominantly Orthodox", "predominantly Buddhist", "Scandinavian",
  "Baltic", "Mediterranean", "South Asian", "Southeast Asian",
  "Sub-Saharan African", "Southern African", "South American", "Central American",
  "South Pacific", "East Asian", "Middle Eastern", "Central European",
  "North African", "Balkan", "former Soviet", "China-neighboring",
  "camel-driv", "tiger-roamed", "pachyderm-keep", "Olympic badminton medal winn",
  "oil-produc", "vodka-export", "nuclear-powered", "juvenile-offender execut",
  "tourism-dependent", "Olympic judo Silver medal winn", "violence-ravaged", "pepper-produc",
  "cricket-play", "oil-guzzl", "cannabis-cultivat", "bug-eat",
  "least corrupt", "insufficiently-reproducing", "fermented mare's milk drink", "orange-white-and-green flag-wav",
  "US visa-waiver pilot-program participat", "US bullet-buy", "ancient pyramid-maintain", "hydroelectric",
  "border-disput", "AIDS crisis-stricken", "perceived as egregiously corrupt", "undersexed",
  "heavily landmined", "person-traffick", "shark-infested", "Simpsons' travel destination",
  "former French colony", "comparatively depressed", "comparatively happy", "former Ottoman",
  "former Sassanid", "former Habsburg", "former Roman", "frequently lightning-struck",
  "Australopithecus fossil-hous", "population-skyrocket", "EU", "UN Security Council Permanent Member",
  "G7", "Fishery Committee for the Eastern Central Atlantic member"
];

const nProperties = propNames.length;
const nProperties2 = nProperties - 63;

// =========================================================================
// DATABASE: Property grammar codes (verbs and adjectives)
// =========================================================================
const propVerbs = [
  0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1,
  1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1,
  1, 1, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1
];

const propAdjs = [
  1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0,
  1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0,
  0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
];

// =========================================================================
// DATABASE: Country properties (base-64 encoded, 94 bits per country)
// Each string decodes to a boolean array of property flags
// =========================================================================
const countryPropsB64 = [
  "BHAAAAAArwYSTIAD", // United States of America
  "BGAAAAAAJxcaCAAB", // Canada
  "ABAAAQgAlwwGBAAI", // Mexico
  "AAAAAQgAEQweAAAA", // Guatemala
  "oAAgAQAAIQAAAAAC", // Cuba
  "gDAAAQAAEAAQEAAA", // Haiti
  "gAAAAQAAEQACAAAA", // Dominican Republic
  "AkAAAQgAEgQSAAAE", // Belize
  "ABAEAQgAAAweACAA", // Honduras
  "ABEEAQgAAAhSAAAA", // Nicaragua
  "ABIAAQgAEAQaACAA", // Costa Rica
  "AAIAAQgAEQAKAAAQ", // Panama
  "ABIAAQQAQwwaAAgA", // Colombia
  "AAAAAQQAAQgYQCAA", // Venezuela
  "AEAEAAQAAAwSAAAA", // Guyana
  "EAAAAAQAAQgYAAAA", // Suriname
  "AAIBAQQAAAQQECAA", // French Guyana
  "ABoAAQQAAQhKAAAA", // Ecuador
  "ADAAAQQAAQgKAAAQ", // Peru
  "AAEEAQQAAQhSAAAE", // Bolivia
  "IBAAAQQAAQgSAAAA", // Chile
  "ABAAAQQABwESAAAA", // Argentina
  "AAAAAQQAAAALAAAA", // Uruguay
  "ASEAAQAAEAIDAAQA", // Andorra
  "AAEAAQQAQAwIAAgQ", // Paraguay
  "BIIAAQQAJwwKDAAE", // Brazil
  "IBSIIAARkQQQEQQK", // Morocco
  "ABEAAgAURiQQogAA", // Armenia
  "EASGAAARAAAAEAAK", // Mauritania
  "ACKGAAFQAAQAEAAC", // Senegal
  "IkKGAAAQEAAAAAAC", // Gambia
  "AIIGAABAQAAAAAgC", // Guinea-Bissau
  "ACCEAABAQAAYEAgC", // Guinea
  "AEKEAAFAQAAAAAgC", // Sierra Leone
  "AEIEAABAQAAAAAAC", // Liberia
  "AAAEAABAAYRAECAC", // Cote d'Ivoire
  "AEAEAAFAAQQIAAgC", // Ghana
  "ICAEAAFAAAAAEAgC", // Togo
  "IAAGAAEAAQAIEAAG", // Benin
  "AGAAAAFAiQFQAAAC", // Nigeria
  "AGIUAAFAAQh4EAAC", // Cameroon
  "AgAQAQFAAQAQAAAC", // Equatorial Guinea
  "AAAAAAFAAQgYEAAC", // Gabon
  "ACAEAAFAAQgYEAgC", // Republic of the Congo
  "ACAUAAFAQQwYAAgC", // Democratic Republic of Congo
  "AIAEAAJAQQgIAQAA", // Angola
  "EEQAAAJQAAkqAAAA", // Namibia
  "AGAAAAJABw0yBBAA", // South Africa
  "AIAEAAJAQAwoBQAI", // Mozambique
  "AAAEAAFAAAlYDBAA", // Tanzania
  "AGAEAAFAEQ14ADAA", // Kenya
  "AGSEAABQQAAQBCAA", // Somalia
  "AHEGAABRQAAYARAA", // Ethiopia
  "AASUAABRQQAYgggA", // Sudan
  "ABSAIEARsQAUgQQA", // Egypt
  "EASQIAARAQAQgCQA", // Libya
  "AASAIAARkQAAkAQA", // Tunisia
  "ABSAIAARwQAQkAQA", // Algeria
  "ACWEAABRAAAIEAAI", // Mali
  "ACEGAAFAAAAAEAAE", // Burkina Faso
  "ACWGAABRAIAQEAAA", // Niger
  "ACUEAABRQAAAEBAA", // Chad
  "ACEEAAFAAAgoEAAA", // Central African Republic
  "AEEEAAFAQAlYAAgA", // Uganda
  "AmEMAQFAQAAYAAAA", // Rwanda
  "AiEEAQEAQAAIEAAE", // Burundi
  "AEEEAAJAAAgoAAAA", // Zambia
  "AGEEAAJAAAgwAAAI", // Malawi
  "AEEAAAJAQAkiASAA", // Zimbabwe
  "EGEAAAJAAAggAAAE", // Botswana
  "AmEIAAJAAAAwAAAA", // Swaziland
  "AmEIAAIAEAAgAAAA", // Lesotho
  "gCAEAAIAEAwYEAgI", // Madagascar
  "QBAAIgAAkwISgkQC", // Greece
  "ABCAAAACAQAIgAQA", // Albania
  "ABBAAgACgyAQAAQA", // Yugoslavia
  "QDAAIQAAswMDAEQD", // Italy
  "ACAIIQAAtwITAEYC", // Spain
  "AJAAAQAAEwIDAEQQ", // Portugal
  "AAAAIQAANwMTCMQD", // France
  "gGgIAAAAJxETCMQB", // United Kingdom
  "gGgAAQAAA4MTQEAA", // Ireland
  "AASAAAAUQQRQAAEA", // Azerbaijan
  "AigIAQAAJwIDAEQE", // Belgium
  "ACgIAAAAhxMDQEYC", // Netherlands
  "ACgICAAAAxMTQEAA", // Denmark
  "AAAAAIAAJwMDAEAB", // Germany
  "ACEAAAAAJRILAAQA", // Switzerland
  "AAEAAYAAEwALAEYA", // Austria
  "AAEAAYAApyASgAYA", // Hungary
  "AAFAAIAAByASAAIA", // Czech Republic
  "AABAAYAAIwACAAAS", // Poland
  "AAgICAAABxIDQEAA", // Sweden
  "YCgICAAAAxIbAAAC", // Norway
  "ACgACAAABhIDAEAA", // Finland
  "ABAAAgAAhyAAgAYC", // Romania
  "ABBAAgACpyACIAQE", // Bulgaria
  "QBCAIAAAgQASggQA", // Turkey
  "AASAIEAQAQAQACQA", // Syria
  "AmQAIEAQYgESgCQA", // Israel
  "AASIAEAQEgACACQA", // Jordan
  "ACSSAEAQAQAQgCEA", // Iraq
  "iwSIAAAQEQAAAgAE", // Bahrain
  "AgCIAAAQAQACgAEA", // Kuwait
  "AASIAEAQCQIChiAA", // Saudi Arabia
  "AAFAAgAEAyQAIgAE", // Belarus
  "AASEAEAQCQAAAAAA", // Yemen
  "AASIAEAQAQAAACAA", // Oman
  "AACIAEAQAQESAiAA", // United Arab Emirates
  "ABSAAEAQCQAQAiEA", // Iran
  "ADWAAAAQQEQIAwEA", // Afghanistan
  "AHSSQAAYDQFQAAkQ", // Pakistan
  "AHAAQAB4B42QAAAA", // India
  "gAAABABAUAEIAAAA", // Sri Lanka
  "ICEIQABoEAUIAAAA", // Nepal
  "ADBAAAACQAAIgwYE", // Bosnia and Herzegovina
  "AgEIRABoAAAIAAAE", // Bhutan
  "CACCQABgAQFQAAAE", // Bangladesh
  "ADBAAQACUQAaAQYA", // Croatia
  "gjAAIgAAUAAQgAQA", // Cyprus
  "ABIUxABoQQAQAgAE", // Burma
  "AAAIhABgEQwSAQgA", // Thailand
  "IAMkhABoEAQIEAAA", // Laos
  "AAAIhABgEAwQEwgA", // Cambodia
  "IAokhABoAQgYEQgA", // Vietnam
  "AAAAAAAAAAAAAAAA", // Off-By-One Error
  "AAIIgADgAQkQAAgI", // Malaysia
  "iWAAhAAAARETAAgA", // Singapore
  "gBKAgADgkQxQAggA", // Indonesia
  "AhSAAAARAAAAFAAA", // Djibouti
  "A2CIgAAAAQARAAAE", // Brunei
  "AhAAAQgAAgQGBAAA", // El Salvador
  "AUABAAAIEAGABAAA", // Hong Kong
  "AEAAAAARQAAQAQAA", // Eritrea
  "AAAAEAAEAyAAAAAA", // Estonia
  "gHAAgQAAAQQSAAAQ", // Philippines
  "ADAAAgAEEyQIoAQA", // Georgia
  "gHIIgBAAEQkABAAQ", // Papua New Guinea
  "lEQAABAQAxsDTAAA", // Australia
  "AUABAQAAEAEAAAQA", // Gibraltar
  "gHAAABAAExMLAAAA", // New Zealand
  "BBAgACDwhwiUAIAA", // China
  "AAAwACAoAQAYAAAA", // North Korea
  "QBAAACCApQoQAAAC", // South Korea
  "EAEABAAYIkAAAAAI", // Mongolia
  "gAAIBCAApwqTDAAD", // Japan
  "BAhAAgAsJyRQIoAA", // Russia
  "kCgBAAAAAAAIAAAA", // Greenland
  "kBgACAAAEhIbQAAA", // Iceland
  "ABEAAAAMA0QQAAAA", // Kazakhstan
  "AAGAAAAMAUQYAgAA", // Kyrgyzstan
  "AAAAEAAEAiAIAAAA", // Latvia
  "AiSAIEAQQAACkgQA", // Lebanon
  "AQEIAQAAEAARAAQA", // Liechtenstein
  "AAAAEYAEByAQAAAA", // Lithuania
  "ASEIAQAAAhAJAEQA", // Luxembourg
  "AhFAAgACgAAAgAQI", // Macedonia
  "AAEAAgAEAgQQoAAI", // Moldova
  "CQAIIQAAEAABAAQI", // Monaco
  "QgSIAEAQAQAAAiAA", // Qatar
  "AAFAAYAABwAAAAIA", // Slovak Republic
  "ADBAAQACBAATAAYA", // Slovenia
  "iBAABCAABQKQAAAA", // Taiwan
  "AAGAAAAMQUQYAgAA", // Tajikistan
  "AASAAAAUAcAQAAEA", // Turkmenistan
  "AABAAgAEByRAoAAA", // Ukraine
  "AAWQAAAUI0AAAAAA", // Uzbekistan
  "gUAIAAAAEAAAAAAA", // Antigua and Barbuda
  "gEAAAAAAEQACAAAE", // Bahamas
  "iUAAAAAAEQgCAAAE", // Barbados
  "gUABAAAAEAEAAAAE", // Bermuda
  "gbAAAAAAAAAAAAAC", // Cape Verde
  "gUAAAQAAACQIEAAA", // Dominica
  "gUAIAQAAECQAAAAA", // Grenada
  "gQABAQAAEAAAEAAA", // Guadeloupe
  "gWABAQAAEAAAAAAA", // Guam
  "gkAAAAAAEgwCAAAA", // Jamaica
  "iWAAIQAAEAAAAAQI", // Malta
  "iUAAAAIAEAwQEAAI", // Mauritius
  "gAABARAAAAACFAAA", // New Caledonia
  "gWAAgAAAEAAAAAAQ", // Palau
  "gGABAQAAEQAAQAAA", // Puerto Rico
  "gQABAQIAAAAAEAAA", // Reunion
  "gWAAAQAAEAAQEAAA", // Seychelles
  "gUAAAAQAEywCAAAA"  // Trinidad and Tobago
];


/*
-------------------------------------------------------------------------
Databases referenced in this project:
http://www.cia.gov/cia/publications/factbook/
http://www.fao.org/WAICENT/FAOINFO/SUSTDEV/EIdirect/climate/EIsp0007.htm
http://www.fao.org/WAICENT/FAOINFO/SUSTDEV/EIdirect/climate/EIsp0056.htm
http://www.fao.org/WAICENT/FAOINFO/SUSTDEV/EIdirect/climate/EIsp0009.htm
http://www.ethnologue.com/country_index.asp?place=all
http://www.ethnologue.com/show_language.asp?code=POR
http://unstats.un.org/unsd/mi/mi_results.asp?row_ID=656&fID=r5
http://www.worldbank.org/hipc/about/map/map.html
http://www.panda.org/species/tiger/distribution.cfm
http://www.olympic.org/uk/athletes/results/search_r_uk.asp
http://www.eia.doe.gov/emeu/iea/tableg2.html
http://www.ivodka.com/vodka-by-country.html
http://www.eia.doe.gov/oiaf/ieo/figure_62.html
http://www.deathpenaltyinfo.org/juvchar.html
http://www.olympic.org/uk/athletes/results/search_r_uk.asp
http://www.hotnsaucey.com/countries.html
http://www.cricket.org/link_to_database/NATIONAL/ICC/
http://www.bp.com/centres/energy2002/oil/consumption.asp#
http://www.food-insects.com/book7_31/
http://www.transparency.org/cpi/2001/cpi2001.html#cpi
http://138.251.140.21/~josh/flags/alpha.html
http://www.foreignborn.com/visas_imm/other_visas/11pilot_program.htm
http://www.unaids.org/barcelona/presskit/barcelona%20report/table.html
http://www.boston.com/news/daily/27/sex_chart.htm
http://www.landmines.org/glc/index-glc.asp
http://www.state.gov/g/tip/rls/tiprpt/2002/10678.htm
http://www.flmnh.ufl.edu/fish/Sharks/statistics/GAttack/World.htm
http://www.snpp.com/episodeguide.html
http://www.eur.nl/fsw/research/happiness
http://www.fsmitha.com/h3/map21-ot.html
http://www.fsmitha.com/h1/map20per.htm
http://www.fsmitha.com/h1/map19rm.htm
http://faculty.vassar.edu/piketay/evolution/SiteMap.html
http://users.erols.com/mwhite28/20c-pop3.htm
http://www.fao.org/fi/body/rfb/cecaf/cecaf_mapandmem.htm
"In the Line of Fire," National Geographic, August 2002
*/