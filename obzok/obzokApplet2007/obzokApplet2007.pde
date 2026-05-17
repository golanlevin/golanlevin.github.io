

// Obzok by Golan Levin 
// golan at flong dot com
// Java version: January 1, 2001
// Processing port: September 15, 2007

//--------------------------------------------------------------------------
Obzok obzok;
Skeleton obzokSkeleton;
ImplicitBlob IBs[];
color blobPalette[];
float obzokError;
int nIB;
boolean theMouseDown = false;
float sc = 1.00;//2.9;

//--------------------------------------------------------------------------
void setup(){ 
  size(804,454);
  smooth();
  establishSimulation();
}

//--------------------------------------------------------------------------
void draw(){
    background(0);
    doSimulation();
    
    pushMatrix();
    translate( 0-(sc-1.0)*width/4, 0-(sc-1.0)*height/2);
    scale(sc,sc);
    drawSimulation();
    popMatrix();
    
    pushMatrix();
    translate( 0-(sc-1.0)*width/4*2, 0-(sc-1.0)*height/2); 
    scale(sc,sc);
    translate(width/2, 0); 
    
    drawSimulationWireframe();
    popMatrix();
}


//--------------------------------------------------------------------------
void establishSimulation(){

  obzok = new Obzok();
  obzokSkeleton = obzok.S;
  obzokSkeleton.setScreenCenter(width/4, height/2);

  nIB = 30; //23; //18; //31;
  IBs = new ImplicitBlob[nIB];
  blobPalette = new color[nIB];

  int nP = 0;
  int nParticles;
  float threshold;
  for (int i=0; i<nIB; i++){
    //threshold = (float)(i+1)*0.00008f; // for 31 ImplicitBlobs
    //threshold = (float)(i+1)*0.000155f; // for 16 ImplicitBlobs
    threshold = (float)(i+1)* (0.00248f / (float)nIB);
    nParticles = 8 + ((i+1)*4);
    IBs[i] = new ImplicitBlob(obzokSkeleton, threshold, nParticles);
    nP += nParticles;
  }
  createPalette();
}

//--------------------------------------------------------------------------
void createPalette(){
  //Date now = new Date();
  //float t = (now.getHours()*3600f + now.getMinutes()*60f + now.getSeconds())/86400f;
  //t = (float)(0.5 * (1.0 - Math.cos(t * TWO_PI))); //  0...1

  double rgb[][] = {
    {
      1, 2, 5    }
    , {
      1, 5, 2    }
    , {
      2, 1, 5    }
    , {
      2, 5, 1    }
    , {
      5, 1, 2    }
    , {
      5, 2, 1    }
  };
  int which = (int)(Math.random()*5.99999);
  double rp = rgb[which][0];
  double gp = rgb[which][1];
  double bp = rgb[which][2];

  double ra = 0;
  double ga = 0;
  double ba = 0;

  float f;
  int r, g, b;
  float cc = 1.04f;
  for (int i=0; i<nIB; i++){
    f = (float)i/(float)nIB;
    r = (int)(ra +     255.0 * Math.pow(f/cc,    rp  ));
    g = (int)(ga +     255.0 * Math.pow(f/cc,    gp  ));
    b = (int)(ba +     255.0 * Math.pow(f/cc,    bp  ));
    blobPalette[i] = color(r, g, b);
  }
}

//--------------------------------------------------------------------------
void doSimulation(){

  if (theMouseDown) { 
    obzokSkeleton.mouseDrag(mouseX/sc, mouseY/sc); 
  }
  else {              
    obzokSkeleton.mouseMove(mouseX/sc, mouseY/sc); 
  }
  obzokSkeleton.move();
  obzokSkeleton.moveCentroid();
  obzokSkeleton.computeCentroid();

  obzokError = IBs[nIB-1].calculateError();
  if (obzokError > 10) { 
    initIBs();
  }
  for (int i=0; i<nIB; i++){ 
    IBs[i].move();
  }
}


//--------------------------------------------------------------------------
void drawSimulation(){
  if (obzokSkeleton.nJoints > 0){
    noStroke();
    for (int i=0; i<nIB; i++){
      fill(blobPalette[i]);
      IBs[i].draw();
    }
    obzok.draw();
  }
}

void drawSimulationWireframe(){
  if (obzokSkeleton.nJoints > 0){
    obzok.S.drawStructure();
    obzok.S.drawBody(false);
  }
}

public void initIBs(){
  for (int i=0; i<nIB; i++){ 
    IBs[i].init();
  }
}




//--------------------------------------------------------------------------
// interaction methods
void mousePressed (){ 
  theMouseDown = true;
  obzok.S.mouseDown(mouseX/sc, mouseY/sc);
}


void mouseReleased (){ 
  theMouseDown = false;
  obzok.S.mouseUp(mouseX/sc, mouseY/sc);
}


void mouseMoved (){ 
  theMouseDown = false;
  obzok.S.mouseMove(mouseX/sc, mouseY/sc);
}

void mouseDragged (){ 
  theMouseDown = true;
  obzok.S.mouseDrag(mouseX/sc, mouseY/sc);
}

void keyPressed () {
  createPalette();
  initIBs();
  obzok.S.lastInteractionTime = millis();
}
