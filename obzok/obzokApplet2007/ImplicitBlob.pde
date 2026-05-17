import java.util.Vector;

public class ImplicitBlob{
  // a class which uses particle dynamics
  // in order to maintain a series of particles
  // at a given threshold value in an implicit field.
  // the particles are then used as the knots in a blob.

  private /* static */ Skeleton S;
  private /* static */ Vector joints;
  private /* static */ int nJoints;
  private /* static */ FPoint centroid;
  private /* static */ float centroidX, centroidY;
  private /* static */ FPoint FPArray[];

  private /* static */ final float h = 0.25f; 
  private /* static */ final float h6 = h/6.0f;
  private /* static */ final float h2 = h/2.0f;
  private /* static */ final float TWO_PI = (float)(2f*Math.PI);

  private /* static */ final float K = -50000f; //-500f; // SPRING CONSTANT
  private /* static */ final float D = 0.0007f * (float)(Math.sqrt(Math.abs(K))*2f); //0.9f; // DAMPING CONSTANT
  private /* static */ final float MAX_FORCE =  0.8f;
  private /* static */ final float MIN_FORCE = -0.8f;

  private float xposf[];
  private float yposf[];
  private float xvelf[];
  private float yvelf[];
  private int   npts;
  private float threshold;

  private float cose[];
  private float sine[];


  private Blob B;


  public ImplicitBlob(Skeleton sk, float th, int np){

    threshold = th;

    S = sk; 
    joints = S.joints;
    nJoints = S.nJoints;
    S.computeCentroid();
    centroid = S.centroid;
    centroidX = centroid.x;
    centroidY = centroid.y;

    FPArray = new FPoint[nJoints];
    for (int i=0; i<nJoints; i++){
      FPArray[i] = ((Joint)joints.elementAt(i)).position;
    }

    npts = np;
    B = new Blob(5); 
    xposf = new float[npts];
    yposf = new float[npts];
    xvelf = new float[npts];
    yvelf = new float[npts];

    cose = new float[npts];
    sine = new float[npts];
    double t;
    final float initialR = 150; 
    for (int i=0; i<npts; i++){
      t = ((float)i/(float)(npts)*TWO_PI);
      cose[i] = initialR * (float)Math.cos(t);
      sine[i] = initialR * (float)Math.sin(t);
    }

    init();


  }

  public void init(){ 
    for (int i=0; i<npts; i++){
      xvelf[i] = yvelf[i] = 0f;
      xposf[i] = centroidX + cose[i];
      yposf[i] = centroidY + sine[i];
    }
  }


  public float calculateError(){
    float maxSep = 0;
    float avgSep = 0;
    float sep;
    for (int i=1; i<npts; i++){	
      avgSep += sep = (Math.abs(xposf[i] - xposf[i-1]) + Math.abs(yposf[i] - yposf[i-1]));
      if (sep > maxSep) { 
        maxSep = sep; 
      }
    }
    avgSep /= (float)(npts-1);
    return (maxSep/avgSep);
  }

  //-----------------------------------------------------------------------
  public void draw() { 
    B.draw(); 
  }


  //-----------------------------------------------------------------------
  private /* static */ float G1x, G2x, G3x, G4x;	// intermediate RK values 
  private /* static */ float G1y, G2y, G3y, G4y;	// intermediate RK values 
  private /* static */ float p1x, v1x;	
  private /* static */ float p1y, v1y;	
  private /* static */ float p2x, v2x;	
  private /* static */ float p2y, v2y;
  private /* static */ float p3x, v3x;	
  private /* static */ float p3y, v3y;
  private /* static */ float p4x, v4x;	
  private /* static */ float p4y, v4y;

  public void move(){
    B.clear();
    centroidX = centroid.x;
    centroidY = centroid.y;

    float dx, dy, dh, force;
    float val, dfx, dfy;
    int i,j;

    // RUNGE KUTTA for each point
    for (i=0; i<npts; i++){	


      p1x=xposf[i];
      p1y=yposf[i];
      for (val=j=0; j<nJoints; j++){
        dfx = (p1x-FPArray[j].x); 
        dfy = (p1y-FPArray[j].y);
        val += 1f/(dfx*dfx + dfy*dfy); // WAS: dfh = (dfx*dfx + dfy*dfy); val += (1f/((dfh<1)?1:dfh));
      }
      dx = p1x - centroidX;
      dy = p1y - centroidY;
      dh = (float)Math.sqrt(dx*dx + dy*dy);
      force = K*(threshold - val)/dh; //((dh<1)?1:dh);
      force = (force>MAX_FORCE)?MAX_FORCE:(force<MIN_FORCE)?MIN_FORCE:force; 
      G1x = force*dx - D*(v1x=xvelf[i]);
      G1y = force*dy - D*(v1y=yvelf[i]);


      p2x=p1x+(h2*v1x);
      p2y=p1y+(h2*v1y);
      for (val=j=0; j<nJoints; j++){
        dfx = (p2x-FPArray[j].x); 
        dfy = (p2y-FPArray[j].y);
        val += 1f/(dfx*dfx + dfy*dfy);
      }
      dx = p2x - centroidX;
      dy = p2y - centroidY;
      dh = (float)Math.sqrt(dx*dx + dy*dy);
      force = K*(threshold - val)/dh; 
      force = (force>MAX_FORCE)?MAX_FORCE:(force<MIN_FORCE)?MIN_FORCE:force; 
      G2x = force*dx - D*(v2x=v1x+(h2*G1x));
      G2y = force*dy - D*(v2y=v1y+(h2*G1y));


      p3x=p1x+(h2*v2x);
      p3y=p1y+(h2*v2y);
      for (val=j=0; j<nJoints; j++){
        dfx = (p3x-FPArray[j].x); 
        dfy = (p3y-FPArray[j].y);
        val += 1f/(dfx*dfx + dfy*dfy);
      }
      dx = p3x - centroidX;
      dy = p3y - centroidY;
      dh = (float)Math.sqrt(dx*dx + dy*dy);
      force = K*(threshold - val)/dh;
      force = (force>MAX_FORCE)?MAX_FORCE:(force<MIN_FORCE)?MIN_FORCE:force; 
      G3x = force*dx - D*(v3x=v1x+(h2*G2x));
      G3y = force*dy - D*(v3y=v1y+(h2*G2y));


      p4x=p1x+(h*v3x);
      p4y=p1y+(h*v3y);
      for (val=j=0; j<nJoints; j++){
        dfx = (p4x-FPArray[j].x); 
        dfy = (p4y-FPArray[j].y);
        val += 1f/(dfx*dfx + dfy*dfy);
      }
      dx = p4x - centroidX;
      dy = p4y - centroidY;
      dh = (float)Math.sqrt(dx*dx + dy*dy);
      force = K*(threshold - val)/dh;
      force = (force>MAX_FORCE)?MAX_FORCE:(force<MIN_FORCE)?MIN_FORCE:force; 
      G4x = force*dx - D*(v4x=v1x+(h*G3x));
      G4y = force*dy - D*(v4y=v1y+(h*G3y));


      xposf[i] = p1x + h6*(v1x + 2.0f*v2x + 2.0f*v3x + v4x);
      xvelf[i] = v1x + h6*(G1x + 2.0f*G2x + 2.0f*G3x + G4x);

      yposf[i] = p1y + h6*(v1y + 2.0f*v2y + 2.0f*v3y + v4y);
      yvelf[i] = v1y + h6*(G1y + 2.0f*G2y + 2.0f*G3y + G4y);

      B.addKnot(xposf[i], yposf[i]);

    }


  }

}
