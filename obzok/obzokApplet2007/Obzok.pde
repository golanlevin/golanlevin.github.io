import java.util.Vector;

public class Obzok {

  public /* static */ Skeleton S;
  public /* static */ Vector stalkVector;

  private /* static */ float initx, inity, initr;
  private /* static */ final float TWO_PI = (float)(2f*Math.PI);
  private /* static */ int nDivs;
  private /* static */ float dang;
  private /* static */ float jointSep;

  private /* static */ final boolean BOUNDARY = true;
  private /* static */ final boolean INTERNAL = false;
  private /* static */ final float linkStrength = 1.0f;


  public Obzok (){
    S = new Skeleton();
    initx = 300;
    inity = 250;
    initr = 60; //50
    nDivs = 12;

    stalkVector = new Vector(5);

    float nDivsf = (float)(nDivs);
    dang = TWO_PI/nDivsf;
    float ango = -2.5f*dang;
    jointSep = (float) Math.sqrt(2f*initr*initr*(1f - Math.cos(dang))); // accurate


    // add belly joints
    for (int j=0; j<nDivs; j++){
      float jf = (float) j;
      float jx = (float) (initx + initr*Math.cos(ango + jf*dang));
      float jy = (float) (inity + initr*Math.sin(ango + jf*dang));
      S.addJoint(jx, jy);
    }

    // add links around belly. 
    // some are on the boundary, 
    // others are internal.
    int nDh = nDivs/2;
    for (int j=0; j<nDivs; j++){

      // these are the boundary links
      S.addLink(j, (j+1)%nDivs, true, linkStrength); 		

      // these are the internal links
      for (int i=2; i<nDh; i++){
        S.addLink(j, (j+i)%nDivs, false, linkStrength*0.05f + linkStrength/(float)(i));		
      }
    }

    insertStalk(0, 4);
    insertStalk(1, 3);

    // some hardcoded links, oh well.
    final float str1 = linkStrength*0.1f;
    S.addLink(5, 10, INTERNAL, str1);
    S.addLink(7, 10, INTERNAL, str1);
    S.addLink(6,  9, INTERNAL, str1);
    S.addLink(7,  9, INTERNAL, str1);
    S.addLink(6, 11, INTERNAL, str1);
    S.addLink(6, 10, INTERNAL, str1);
    S.addLink(5, 11, INTERNAL, str1);

    // special wiggly link
    S.addWiggleLink(4, 11, INTERNAL, str1);

    final float str2 = linkStrength*2f;
    S.addLink(24, 0, INTERNAL, str2);
    S.addLink(7, 15, INTERNAL, str2);
    S.addLink(14,16, INTERNAL, str2);
    S.addLink(25, 9, INTERNAL, str2);
    S.addLink(24, 1, INTERNAL, str2);
    S.addLink(13,16, INTERNAL, str2);

    S.setEyeID(S.LEFT_EYE, 2);
    S.setEyeID(S.RIGHT_EYE, 10);
    S.finishConstructing();
  }



  public void draw(){ 
    S.drawBody(true);
    //S.drawStructure(g);
    S.drawEyes();
    S.drawZees();
    S.drawMouth();
  }






  public void insertStalk(int whichDiv, int nSegments){
    whichDiv = whichDiv%12;

    Stalk p;
    int startJointID = whichDiv;
    int nSegsInPrevStalk = 0;
    boolean stalkAlreadyExistsAtWhichDiv = false;
    for (int i=0; i<stalkVector.size(); i++){
      p = (Stalk)stalkVector.elementAt(i);
      if (p.whichDiv == whichDiv) {
        stalkAlreadyExistsAtWhichDiv = true;
        nSegsInPrevStalk = p.nSegments;
        break;
      } 
      else if (p.whichDiv < whichDiv) {
        int nJointsInStalk = p.nSegments * 2;
        startJointID += nJointsInStalk;
      }

    }

    int nj = S.nJoints;
    int ji = startJointID;
    float str = linkStrength*2f;

    Joint prevJ = (Joint) S.joints.elementAt((startJointID+nj-1)%nj);
    Joint nextJ = (Joint) S.joints.elementAt(startJointID);
    // find the link between prevV and nextJ, and un-boundary it.
    S.flipLinkGender(prevJ, nextJ);

    float jx = prevJ.position.x;
    float jy = prevJ.position.y;

    float cang = (float)(whichDiv-3)*dang;
    float dx = jointSep * (float)Math.cos(cang);
    float dy = jointSep * (float)Math.sin(cang);

    // add joints and links on left side of stalk
    for (int i=0; i<nSegments; i++){
      jx += dx;
      jy += dy;
      nj = S.insertJoint(jx, jy, ji);
      //if (i==0){ S.addLink(ji, (ji-2+nj)%nj, INTERNAL);} //external brace
      S.addLink(ji, (ji-1+nj)%nj, BOUNDARY, str);
      ji++;
    }

    jx -= dy;
    jy += dx;


    // add links and joints around right side
    for (int i=0; i<nSegments; i++){
      nj = S.insertJoint(jx, jy, ji);
      S.addLink(ji, ji-1, BOUNDARY, str); // add link around perimeter

        // add internal links
      if (i>0){ 
        S.addLink(ji, ji-(i*2+1), INTERNAL, str);
        S.addLink(ji, ji-(i*2), INTERNAL, str);
      }   
      S.addLink(ji, (ji-((i+1)*2)+nj)%nj, INTERNAL, str);

      jx -= dx;
      jy -= dy;
      ji++;
    }
    S.addLink(ji, ji-1, BOUNDARY, str);
    S.addLink(ji, ji-(nSegments*2), INTERNAL, str);
    //S.addLink(ji-1, (ji+1)%nj, INTERNAL); // external brace


    // add extra internal links
    ji = (startJointID-1)%nj;
    for (int i=0; i<(nSegments-1); i++){
      S.addLink((ji+i+nj)%nj,        (ji+(2*nSegments)-(1+i)+nj)%nj,  INTERNAL, str);
      S.addLink((ji+nSegments-i)%nj, (ji+nSegments+3+i)%nj,           INTERNAL, str);
    }



    stalkVector.addElement(new Stalk(whichDiv, nSegments, startJointID));


  }



  private class Stalk {
    public int whichDiv;
    public int nSegments;
    public int startJointID;

    public Stalk (int w, int n, int i){
      whichDiv = w;
      nSegments = n;
      startJointID = i;
    }
  }





} 
// user able to grab obzok within the body polygon
// anchor obzok in center of screen - can't pull out of view
// clamp user's ability to grab an individual point
// singlecell homepage
// background changes color -- no
// springs for extra cohesion in IB's?  --- no
// goes to sleep. makes Zzzz.
// ticklish -- nope
// obzok changes color -- tried it; nope
// automatically right himself after awhile.
// food particles... -- skip
// feed obzok. little bubbles/ squirls.-- skip
// eyes change size -- skip
// occasional IB re-inits..

// change expression of mouth
// refine mouth with an oval that is proportional to total displacement
