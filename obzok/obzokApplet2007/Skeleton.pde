// Skeleton.java
import java.awt.*;
import java.util.Vector;

public class Skeleton {

  public int 	        nJoints;
  public int	        nLinks;
  private float	        nJointsInv;

  private Joint	        jointArray[];
  private Link	        linkArray[];
  private FPoint	jointFPArray[];
  private boolean 	constructed;

  private int 	        wiggleLinkID = -1;
  private float 	randomMovementAmount;
  private float 	wiggleAmount, wiggleSpeed;

  public Vector 	joints;
  public Vector 	links;
  public FPoint 	centroid;
  private Blob          B;
  private float 	screenXc, screenYc;
  float myMouseX, myMouseY;

  private float 	displacement;
  private FPoint 	totalDisplacement;
  private float 	orientation = 0;


  public long         lastInteractionTime;
  private final long   BEDTIME   = 8000;
  private final long   SNORETIME = 10000;
  private final long   RANDTIME  = 6000;




  public Skeleton() {


    constructed = false;
    joints = new Vector(32);
    links = new Vector(100);
    nJoints = 0;
    nLinks = 0;
    B = new Blob(10);
    centroid = new FPoint();
    totalDisplacement = new FPoint();
    displacement = 0;

    wiggleAmount = 0f;
    wiggleSpeed = 500;
    randomMovementAmount = 0.5f;
    lastInteractionTime = millis();

    sleeping = false;
    zees = new Zparticle[nZees];
    for (int i=0; i<nZees; i++) {
      zees[i] = new Zparticle();
    }

    baseHSB = new float[3];
    int r = (int)red(baseColor);
    int g = (int)green(baseColor);
    int b = (int)blue(baseColor);
    Color.RGBtoHSB(r, g, b, baseHSB);

    generateMouthMatrix();
  }


  public void setScreenCenter(float xc, float yc) {
    mouthX = screenXc = xc;
    mouthY = screenYc = yc;
  }


  public void addJoint(float x, float y) {
    Joint J = new Joint(x, y, nJoints);
    joints.addElement(J);
    nJoints++;
  }

  public int insertJoint(float x, float y, int i) {
    Joint J = new Joint(x, y, nJoints);
    joints.insertElementAt(J, i);
    nJoints = joints.size();
    return nJoints;
  }

  public void addLink(int from, int toi, boolean b, float s) {
    nJoints = joints.size();
    if ((from >= 0)&&(from < joints.size()) &&
      (toi >= 0)  &&(toi < joints.size()) && (from != toi)) {
      Joint jf = (Joint) joints.elementAt(from);
      Joint jt = (Joint) joints.elementAt(toi);
      links.addElement(new Link(jf, jt, b, s));
      nLinks++;
    }
  }


  public void addWiggleLink(int from, int toi, boolean b, float s) {
    nJoints = joints.size();
    if ((from >= 0)&&(from < joints.size()) &&
      (toi >= 0)  &&(toi < joints.size()) && (from != toi)) {
      Joint jf = (Joint) joints.elementAt(from);
      Joint jt = (Joint) joints.elementAt(toi);
      links.addElement(new Link(jf, jt, b, s));
      wiggleLinkID = nLinks;
      nLinks++;
    }
  }

  /*
	public void addLink(Link L){
   		int from = L.j0.id;
   		int to   = L.j1.id;
   		nJoints = joints.size();
   		if ((from >= 0)&&(from < joints.size()) &&
   			(to >= 0)  &&(to   < joints.size()) && (from != to)) {
   			links.addElement(L);
   			nLinks++;
   		}
   	}
   	*/


  public void finishConstructing() {
    jointArray = new Joint[(nJoints = joints.size())];
    jointFPArray = new FPoint[nJoints];
    linkArray = new Link[(nLinks = links.size())];
    nJointsInv = 1f/(float)nJoints;

    for (int i=0; i<nJoints; i++) {
      jointArray[i] = (Joint) joints.elementAt(i);
      jointFPArray[i] = jointArray[i].position;
    }
    for (int i=0; i<nLinks; i++) {
      linkArray[i] = (Link) links.elementAt(i);
    }
    constructed = true;
    computeCentroid();
    for (int i=0; i<nZees; i++) {
      zees[i].init();
    }
  }


  public void flipLinkGender(Joint ji, Joint jj) {
    int elt = 0;
    boolean foundit = false;
    while ((foundit == false) && (elt<links.size())) {
      Link L = (Link) links.elementAt(elt++);
      if ((L.j0.equals(ji)) && (L.j1.equals(jj))) {
        L.flipBoundary();
        foundit = true;
      } else if ((L.j0.equals(jj)) && (L.j1.equals(ji))) {
        L.flipBoundary();
        foundit = true;
      }
    }
  }


  public void moveCentroid() {
    if (constructed) {
      // ARRAY VERSION
      float dx = (screenXc - centroid.x)*0.05f;
      float dy = (screenYc - centroid.y)*0.05f;
      for (int j=0; j<nJoints; j++) {
        jointFPArray[j].translate(dx, dy);
      }
    } else {
      // VECTOR VERSION
      if (nJoints>0) {
        float dx = (screenXc - centroid.x)*0.05f;
        float dy = (screenYc - centroid.y)*0.05f;
        FPoint pos;
        for (int i=0; i<joints.size(); i++) {
          pos = ((Joint) joints.elementAt(i)).position;
          pos.x += dx;
          pos.y += dy;
        }
      }
    }
  }


  public void move() {
    if (constructed) {
      // ARRAY VERSION
      long timeSinceInteract = millis() - lastInteractionTime;

      float snorefactor = (Math.max(BEDTIME, Math.min(timeSinceInteract, SNORETIME)) - BEDTIME)/(float)(SNORETIME-BEDTIME);//0...1

      wiggleAmount = 0.5f + 1.25f*snorefactor;
      wiggleSpeed = 700;
      if (wiggleLinkID >= 0) {
        linkArray[wiggleLinkID].wiggle(wiggleAmount, wiggleSpeed);
      }

      randomMovementAmount = 0.5f * Math.min(timeSinceInteract, RANDTIME)/RANDTIME; //0...0.5
      moveRandomly();

      correctOrientation();


      // THE OBZOK ITSELF
      int i;
      for (i=0; i<nLinks; i++) {
        linkArray[i].update();
      }
      for (i=0; i<nJoints; i++) {
        jointArray[i].update();
      }
    } else {
      // VECTOR VERSION
      for (int i=0; i<(nLinks = links.size()); i++) {
        Link L = (Link) links.elementAt(i);
        L.update();
      }

      for (int j=0; j<(nJoints = joints.size()); j++) {
        Joint J = (Joint) joints.elementAt(j);
        J.update();
      }
    }
  }


  private int grabJoint = -1;
  private boolean grabbed = false;
  private float grabOffsetX, grabOffsetY;
  private final float MIN_GRAB_DISTANCE = 30.0f;
  public void mouseUp(float mx, float my) {
    lastInteractionTime = millis();
    grabbed = false;
    grabJoint = -1;
  }

  public void mouseDown(float mx, float my) {
    lastInteractionTime = millis();
    if (!grabbed) {
      grabJoint = -1;
      float dist = 99999;

      if (constructed) {
        // ARRAY VERSION
        for (int j=0; j<nJoints; j++) {
          FPoint J = jointFPArray[j];
          float dx = (J.x - mx);
          float dy = (J.y - my);
          float dh = (float) Math.sqrt(dx*dx + dy*dy);
          if (dh < dist) {
            dist = dh;
            grabJoint = j;
            if (dh <= MIN_GRAB_DISTANCE) {
              grabOffsetX = 0;
              grabOffsetY = 0;
              grabbed = true;
            } else {
              grabOffsetX = dx;
              grabOffsetY = dy;
            }
          }
        }
        if (!grabbed) {
          if (B.pointWithin(mx, my)) {
            grabbed = true;
          }
        }
      } else {
        // VECTOR VERSION
        for (int j=0; j<(nJoints = joints.size()); j++) {
          Joint J = (Joint) joints.elementAt(j);
          float dx = (J.position.x  - mx);
          float dy = (J.position.y  - my);
          float dh = (float) Math.sqrt(dx*dx + dy*dy);
          if (dh < dist) {
            dist = dh;
            if (dh <= MIN_GRAB_DISTANCE) {
              grabJoint = j;
              grabbed = true;
            }
          }
        }
      }
    }
  }

  public void mouseDrag(float mx, float my) {
    lastInteractionTime = millis();
    if (grabbed && (grabJoint > -1)) {
      if (constructed) {
        // ARRAY VERSION
        jointArray[grabJoint].moveTowards(mx+grabOffsetX, my+grabOffsetY);
        grabOffsetX *= 0.96f;
        grabOffsetY *= 0.96f;
      } else {
        // VECTOR VERSION
        ((Joint)joints.elementAt(grabJoint)).moveTowards(mx, my);
      }
    }
  }

  public void mouseMove(float mx, float my) {
    if (((myMouseX - mx) != 0) || ((myMouseY - my) != 0)) {
      lastInteractionTime = millis();
    }
    myMouseY = my;
    myMouseX = mx;
    grabbed = false;
    grabJoint = -1;
  }




  public void moveRandomly() {
    if (randomMovementAmount > 0) {
      if (constructed) {
        // ARRAY VERSION
        FPoint J;
        for (int i=0; i<nJoints; i++) {
          J = jointFPArray[i];
          J.x += randomMovementAmount*((float)(Math.random() - 0.5));
          J.y += randomMovementAmount*((float)(Math.random() - 0.5));
        }
      } else {
        // VECTOR VERSION
        if (nJoints>0) {
          FPoint pos;
          nJoints = joints.size();
          for (int i=0; i<nJoints; i++) {
            pos = ((Joint) joints.elementAt(i)).position;
            pos.x += (float)(Math.random() - 0.5);
            pos.y += (float)(Math.random() - 0.5);
          }
        }
      }
    }
  }




  //-----------------------------------------------------------------------------------------------	
  public FPoint computeCentroid() {
    if (nJoints>0) {

      if (constructed) {
        // ARRAY VERSION
        float x = 0;
        float y = 0;
        FPoint pos;
        for (int i=0; i<nJoints; i++) {
          pos = jointFPArray[i];
          x+=pos.x;
          y+=pos.y;
        }
        centroid.set(x*nJointsInv, y*nJointsInv);
      } else {
        // VECTOR VERSION
        float x = 0;
        float y = 0;
        FPoint pos;
        for (int i=0; i<(nJoints = joints.size()); i++) {
          pos = ((Joint) joints.elementAt(i)).position;
          x+=pos.x;
          y+=pos.y;
        }
        x/=nJoints;
        y/=nJoints;
        centroid.set(x, y);
      }
    }

    return centroid;
  }





  //-----------------------------------------------------------------------------------------------


  public void drawBody(boolean bFill) {

    //updateBodyColor();
    float r = red(bodyColor);
    float g = green(bodyColor);
    float b = blue(bodyColor);

    if (bFill) {
      noStroke();
      fill(r, g, b);
    } else {
      strokeWeight(2); 
      stroke(r, g, b);
      noFill();
    }

    if (constructed) {
      // ARRAY VERSION
      B.clear();
      for (int j=0; j<nJoints; j++) {
        B.addKnot(jointFPArray[j]);
      }
      B.draw();
    } else {
      // VECTOR VERSION
      Joint joint0;
      B.clear();
      for (int j=0; j<(nJoints = joints.size()); j++) {
        joint0 = (Joint) joints.elementAt(j);
        B.addKnot(joint0.position);
      }
      B.draw();
    }
    
    strokeWeight(1);
  }



  private color baseColor = color(255, 240, 240);
  private float baseHSB[];
  private color bodyColor = color (255, 240, 240);





  //-----------------------------------------------------------------------------------------------	
  public void drawStructure () {

    Joint joint0;
    Link link0;

    if (constructed) {
      // ARRAY VERSION
      for (int j=0; j<nJoints; j++) {
        jointArray[j].draw();
      }
      for (int k=0; k<nLinks; k++) {
        linkArray[k].draw();
      }
    } else {
      // VECTOR VERSION
      for (int j=0; j<joints.size(); j++) {
        joint0 = (Joint) joints.elementAt(j);
        joint0.draw();
      }

      for (int k=0; k<links.size(); k++) {
        link0 = (Link) links.elementAt(k);
        link0.draw();
      }
    }
  }








  //----------------------------------------------------------------------------------------
  // EYES & MOUTH

  public  final int LEFT_EYE = 0;
  public  final int RIGHT_EYE = 1;
  private int leftEyeStartJoint = 0;
  private int rightEyeStartJoint = 0;
  private float leftEyeR, leftPupR;
  private int   leftEyeD, leftPupD;
  private int   rightEyeD, rightPupD;
  private float rightEyeR, rightPupR;

  public void setEyeID(int whichEye, int whichJoint) {
    if (whichEye == LEFT_EYE) {
      leftEyeStartJoint = whichJoint;
      leftEyeR = 8;
      leftEyeD = (int)(leftEyeR*2f);
      leftPupR = leftEyeR*0.25f;
      leftPupD = (int)(leftPupR*2f+1);
    } else if (whichEye == RIGHT_EYE) {
      rightEyeStartJoint = whichJoint;
      rightEyeR = 8;
      rightEyeD = (int)(rightEyeR*2f);
      rightPupR = rightEyeR*0.25f;
      rightPupD = (int)(rightPupR*2f+1);
    }
  }


  private FPoint Lj, Rj;
  private float Lx, Ly, Rx, Ry;
  private float dxml, dyml, dhml, dxpl, dypl;
  private float dxmr, dymr, dhmr, dxpr, dypr;
  private float lookXl, lookYl, lookXr, lookYr;
  private float cosl, sinl, cosr, sinr;
  private float bdxl, bdyl, bdhl, bdxr, bdyr, bdhr;
  private float view;
  private final float SCOPE = 200f;
  private boolean deadpan = true;
  private long deadpanStartTime = millis();
  private final long deadpanDuration = 850;
  private final float deadpanProbability = 0.0095f;

  private boolean timeToBlink = false;
  private long lastBlinkTime = millis();
  private final long minimumBlinkHiatus = 3000;
  private final float blinkProbability = 0.05f;
  private final color eyeColor = color(192-8, 153-8, 153-8);

  private final float initialOrientation = 0.25f;
  private void correctOrientation() {
    float dang = 0.03f*(orientation - initialOrientation); // - pi ... pi
    float dx = centroid.x - jointFPArray[20].x;
    float dy = centroid.y - jointFPArray[20].y;	
    float fx = dy *dang;
    float fy = -dx*dang;
    jointArray[20].addDisplacement(fx, fy);
  }


  public void drawEyes () {
    strokeWeight(1);

    // compute eye center locations
    Lx = Ly = Rx = Ry = 0;
    for (int i=0; i<4; i++) {
      Lj = jointFPArray[leftEyeStartJoint+i];
      Rj = jointFPArray[rightEyeStartJoint+i];

      Lx += Lj.x;
      Rx += Rj.x;
      Ly += Lj.y;
      Ry += Rj.y;
    }
    Lx/=4f;
    Ly/=4f;
    Rx/=4f;
    Ry/=4f;

    // compute the obzok's orientation
    orientation = (float)(Math.PI*0.5 + Math.atan2(((Ly+Ry)*0.5)-centroid.y, ((Lx+Rx)*0.5)-centroid.x));


    // draw the eye whites.
    noStroke();
    fill(255, 255, 255);
    ellipse ((Lx), (Ly), leftEyeD, leftEyeD); //-leftEyeR
    ellipse ((Rx), (Ry), rightEyeD, rightEyeD); //-rightEyeR

    // draw the eye outlines.
    noFill();
    stroke (eyeColor);
    ellipse ((Lx), (Ly), leftEyeD, leftEyeD); //-leftEyeR
    ellipse ((Rx), (Ry), rightEyeD, rightEyeD); //-rightEyeR

    // draw the pupils.
    lookXl = 0;
    lookYl = 0;
    lookXr = 0;
    lookYr = 0;
    long now = millis();
    if (now < 1000) {
      fill (eyeColor);
      ellipse ((Lx), (Ly), leftPupD, leftPupD); // -leftPupR
      ellipse ((Rx), (Ry), rightPupD, rightPupD); // -rightPupR
    } else {


      // decide whether to go deadpan
      if (deadpan) {
        if ((now - deadpanStartTime) > deadpanDuration) {
          deadpan = false;
        }
      } else {
        lookXl = myMouseX - Lx;
        lookYl = myMouseY - Ly;
        lookXr = myMouseX - Rx;
        lookYr = myMouseY - Ry;
        if ((Math.random() < deadpanProbability) &&
          ((now - deadpanStartTime) > deadpanDuration*2)) {
          deadpanStartTime = now;
          deadpan = true;
        }
      }


      // decide whether it's time to blink
      long elapsed = (now - lastInteractionTime);
      if (elapsed > BEDTIME) {
        // sleeping
        timeToBlink = true;
        if (sleeping == false) {
          for (int i=0; i<nZees; i++) {
            zees[i].init();
          }
        }
        sleeping = true;
      } else if (((now - lastBlinkTime) > minimumBlinkHiatus) &&
        (Math.random() < blinkProbability)) {
        // regular blink
        timeToBlink = true;
        lastBlinkTime = now;
        sleeping = false;
      } else {
        // no blink
        timeToBlink = false;
        if (sleeping) {
          // wake up
          initIBs();
        }
        sleeping = false;
      }

      strokeWeight(1.0);
      stroke (eyeColor, 128);
      fill (eyeColor);
      if (timeToBlink) {
        // draw blinked eyes
        bdxl = Lx - centroid.x;
        bdyl = Ly - centroid.y;
        bdhl = leftEyeR/(float)Math.sqrt(bdxl*bdxl + bdyl*bdyl);
        cosl = bdyl*bdhl;
        sinl = bdxl*bdhl;

        bdxr = Rx - centroid.x;
        bdyr = Ry - centroid.y;
        bdhr = rightEyeR/(float)Math.sqrt(bdxr*bdxr + bdyr*bdyr);
        cosr = bdyr*bdhr;
        sinr = bdxr*bdhr;

        line(
          (Lx - cosl), (Ly + sinl),
          (Lx + cosl), (Ly - sinl));
        line(
          (Rx - cosr), (Ry + sinr),
          (Rx + cosr), (Ry - sinr));
      } else {
        // draw unblinked eyes, looking at the cursor
        dxml = 0.5f*(dxml + lookXl);
        dyml = 0.5f*(dyml + lookYl);
        dhml = (float)Math.sqrt(dxml*dxml + dyml*dyml);
        view = (Math.min(dhml, SCOPE)/SCOPE)*(leftEyeR*0.6f)/dhml;
        dxpl = dxml*view;
        dypl = dyml*view;

        dxmr = 0.5f*(dxmr + lookXr);
        dymr = 0.5f*(dymr + lookYr);
        dhmr = (float)Math.sqrt(dxmr*dxmr + dymr*dymr);
        view = (Math.min(dhmr, SCOPE)/SCOPE)*(leftEyeR*0.6f)/dhmr;
        dxpr = dxmr*view;
        dypr = dymr*view;

        ellipse ((Lx+dxpl), (Ly+dypl), leftPupD, leftPupD); // -leftPupR
        ellipse ((Rx+dxpr), (Ry+dypr), rightPupD, rightPupD); // -rightPupR
      }
    }
  }


  private final float mouthR = 70;
  private int mouthD = (int)(mouthR*2);
  private int mouthAng;
  private float mouthX, mouthY;

  // mouth spline control coords
  private float ux0, ux1, ux2, ux3;
  private float uy0, uy1, uy2, uy3;
  private float vx1 = 0;
  private float vy1 = 0;
  private float vx2 = 0;
  private float vy2 = 0;
  private float m0, m1, m2, m3;
  private float M[];

  private final int MOUTH_PTS = 8;
  private float matrix[][] = new float[MOUTH_PTS][4];
  private void generateMouthMatrix() {
    float bt, bt2, onemt, onemt2;
    for (int p=0; p<MOUTH_PTS; p++) {
      bt		= (float)(p)/(float)(MOUTH_PTS-1);	//bt
      bt2		= bt * bt;				//bt2
      matrix[p][0]	= bt * bt2;				//bt3
      onemt		= 1.0f- bt;				//onemt
      onemt2		= onemt * onemt;			//onemt2
      matrix[p][1]	= onemt * onemt2;			//onemt3
      matrix[p][2]	= bt * onemt2 *3f;			//bto2
      matrix[p][3]	= bt2 * onemt *3f;			//bt2o
    }
  }

  private float unc = 500;
  public void drawMouth() {
    stroke(eyeColor); //Color.lightGray);
    //anchX = 0.5f*anchX + 0.5f*centroid.x; //0.25f*(centroid.x + jointFPArray[20].x); //centroid.x
    //anchY = 0.5f*anchY + 0.5f*centroid.y; //0.25f*(centroid.y + jointFPArray[20].y); //centroid.y

    mouthX = 0.5f*mouthX + 0.25f*(centroid.x + jointFPArray[20].x); //centroid.x
    mouthY = 0.5f*mouthY + 0.25f*(centroid.y + jointFPArray[20].y); //centroid.y


    float mood = obzokError;
    float cm = (11+mood)*(float)Math.cos(orientation);
    float sm = (11+mood)*(float)Math.sin(orientation);

    ux0 = mouthX - cm;
    uy0 = mouthY - sm;

    ux3 = mouthX + cm;
    uy3 = mouthY + sm;

    // make different expressions based on whether
    // & where the user has grabbed the obzok
    float hist = 0.99f;
    float hinv = 1f - hist;
    float kist = 0.10f;
    float kinv = 1f - kist;
    if (grabbed) {

      if (grabJoint <= 15) {
        // if the user has grabbed an eyestalk
        // make a slightly uncomfortable expression
        unc += (float)(Math.random()*10f);
        float sint = kinv*0.5f*(float)Math.sin((millis()+unc)/2000.0);
        vx1 = (kist*vx1 - sm*sint);
        vy1 = (kist*vy1 + cm*sint);
        vx2 = (kist*vx2 + sm*sint);
        vy2 = (kist*vy2 - cm*sint);
      } else {
        // if the user has grabbed the body,
        // make a pleased expression
        vx1 = (hist*vx1 - hinv*sm*0.5f);
        vy1 = (hist*vy1 + hinv*cm*0.5f);
        vx2 = (hist*vx2 - hinv*sm*0.5f);
        vy2 = (hist*vy2 + hinv*cm*0.5f);
      }
    } else {
      // make an essentially neutral expression
      vx1 = (hist*vx1 - hinv*sm*0.1f);
      vy1 = (hist*vy1 + hinv*cm*0.1f);
      vx2 = (hist*vx2 - hinv*sm*0.1f);
      vy2 = (hist*vy2 + hinv*cm*0.1f);
    }


    ux1 = ux0 + 0.33f*(ux3-ux0) + vx1;
    uy1 = uy0 + 0.33f*(uy3-uy0) + vy1;

    ux2 = ux0 + 0.66f*(ux3-ux0) + vx2;
    uy2 = uy0 + 0.66f*(uy3-uy0) + vy2;



    float x1, y1;
    float x0 = ux0;
    float y0 = uy0;
    strokeWeight(1.5);
    for (int p=1; p<MOUTH_PTS; p++) {
      if (p==1) {
        strokeWeight(1.5);
      } else if (p==(MOUTH_PTS-1)) {
        strokeWeight(1.5);
      } else {
        strokeWeight(1.25);
      }
      M = matrix[p];
      x1 = ((m1=M[1])*ux0 + (m2=M[2])*ux1 + (m3=M[3])*ux2 + (m0=M[0])*ux3);
      y1 = ( m1*uy0 +        m2*uy1 +        m3*uy2 +        m0*uy3);
      line ( x0, y0, x1, y1);
      x0 = x1;
      y0 = y1;
    }
    strokeWeight(1.0);
  }




  private boolean sleeping;
  private Zparticle zees[];
  private final int nZees = 10;

  public void drawZees() {
    if (sleeping) {
      fill(bodyColor);
      for (int i=0; i<nZees; i++) {
        zees[i].draw();
        zees[i].move();
      }
    }
  }


  private class Zparticle {
    private FPoint 	position;
    private FPoint 	velocity;
    private float fx, fy;

    public Zparticle () {
      position = new FPoint();
      velocity = new FPoint();
      init();
    }
    public void init() {
      position.set(centroid.x, centroid.y);
      velocity.clear();
    }
    public void move() {
      fx = (fx + (float)(Math.random() - 0.50))*0.5f;
      fy = (fy + (float)(Math.random() - 0.70))*0.5f;
      velocity.scale(0.9f);
      velocity.translate(fx, fy);
      position.translate(velocity);
      if (position.y < 0) {
        init();
      }
    }
    public void draw() {
      stroke(255, 240, 240, 144);
      noFill();
      ellipse(position.x, position.y, 7, 7);
      // text("z", position.x, position.y);
    }
  }
}
