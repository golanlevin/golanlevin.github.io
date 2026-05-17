// Blob;
// a class which connects the dots 
// of a set of FPoint knots
// with a bloblike closed spline

public class Blob {


  private static final int MAX_PRECISION = 12;
  private static final int MIN_PRECISION = 2;
  private int PRECISION;

  private int nBezPoints = PRECISION;
  private int nBezSegments = PRECISION-1;
  private float matrix[][] = new float[MAX_PRECISION][4];
  private static final float SPLINE_BIAS = (1.0f/4.0f);   
  private static final int MAX_KNOTS = 150;

  private  FPoint  knots[] = new FPoint[MAX_KNOTS];
  private  int 	nKnots;
  private  Rectangle rBounds;

  // Polygon variables
  private Polygon P;
  private int nPts;
  private int xPts[];
  private int yPts[];
  
  float xPtsf[];
  float yPtsf[];



  //--------------------------------------------------------------------------------    
  public Blob(int p) {
    setPrecision(p);
    nKnots = 0;
    for (int i=0; i<MAX_KNOTS; i++){ 
      knots[i] = new FPoint();
    }  
    P = new Polygon();
    nPts = 0;
    rBounds = new Rectangle();
  }

  public void clear(){
    nKnots = 0;
    nPts = 0;
  }


  public synchronized void setPrecision(int precision){
    PRECISION = Math.max(MIN_PRECISION, Math.min(precision, MAX_PRECISION));
    nBezPoints = PRECISION;
    nBezSegments = PRECISION-1;
    generateInternalMatrix();
  }

  // cache some numbers used in the rendering of the Blob's splines
  private void generateInternalMatrix(){
    float bt, bt2, onemt, onemt2;
    for (int p=0; p<nBezPoints; p++){
      bt		= (float)p/(float)nBezSegments;		//bt
      bt2		= bt * bt;				//bt2
      matrix[p][0]	= bt * bt2;				//bt3
      onemt		= 1.0f- bt;				//onemt
      onemt2		= onemt * onemt;			//onemt2
      matrix[p][1]	= onemt * onemt2;			//onemt3
      matrix[p][2]	= bt * onemt2 *3f;			//bto2
      matrix[p][3]	= bt2 * onemt *3f;			//bt2o
    }
  }

  public synchronized void addKnot(FPoint k){
    knots[nKnots] = k;
    nKnots = Math.min(nKnots+1, MAX_KNOTS-1);
  }

  public synchronized void addKnot(float x, float y){
    knots[nKnots].x = x;
    knots[nKnots].y = y;
    nKnots++;
    //nKnots = Math.min(nKnots+1, MAX_KNOTS-1);
    // DANGEROUS!
  }



  //-------------------------------------------------------------------------------------------- 
  public boolean pointWithin(float x, float y) {
    // this code is necessary because of a bug in awt.Polygon
    // (Polygon's bounds are not re-computed when the Polygon is changed.)
    // the code is modified from Java's own implementation of Polygon.contains().


    // compute the useful bounding rectangle
    rBounds.x = 99999;
    rBounds.y = 99999;
    int r = -99999;
    int b = -99999;
    for (int k=0; k<nKnots; k++){
      rBounds.x = (int)(Math.min(rBounds.x, knots[k].x));
      rBounds.y = (int)(Math.min(rBounds.y, knots[k].y));
      r = (int)(Math.max(r, knots[k].x));
      b = (int)(Math.max(r, knots[k].y));
    }
    rBounds.height = b-rBounds.y;
    rBounds.width =  r-rBounds.x;


    // do a simple bounding rectangle test first
    if (rBounds.contains((int)x, (int)y)) {

      int hits = 0;
      float ySave = 0;
      int npoints = nKnots;

      // Find a vertex that's not on the halfline
      int i = 0;
      while (i < npoints && knots[i].y == y) {
        i++;
      }

      // Walk the edges of the polygon
      for (int n = 0; n < npoints; n++) {
        int j = (i + 1) % npoints;

        float dx = knots[j].x - knots[i].x;
        float dy = knots[j].y - knots[i].y;

        // Ignore horizontal edges completely
        if (dy != 0) {
          // Check to see if the edge intersects
          // the horizontal halfline through (x, y)
          float rx = x - knots[i].x;
          float ry = y - knots[i].y;

          // Deal with edges starting or ending on the halfline
          if (knots[j].y == y && knots[j].x >= x) { 
            ySave = knots[i].y;
          }
          if (knots[i].y == y && knots[i].x >= x) {
            if ((ySave > y) != (knots[j].y > y)) { 
              hits--; 
            }
          }

          // Tally intersections with halfline
          float s = ry / dy;
          if (s >= 0.0 && s <= 1.0 && (s * dx) >= rx) { 
            hits++; 
          }
        }
        i = j;
      }

      // Inside if number of intersections odd
      return (hits % 2) != 0;
    } 
    else {
      return false;
    }

  }












  //--------------------------------------------------------------------------------
  // temporary variables used by draw()
  private FPoint fph, fpi, fpj, fpk;
  private float  x0, x1, x2, x3;
  private float  y0, y1, y2, y3;
  private float  m0, m1, m2, m3;
  private float  M[];

  private int n, nK, nKnotsm2;
  public void draw(){

    if (nKnots > 0){
      n = 0;
      nK = nKnots;
      nKnotsm2=nKnots-2;

      nPts = nK*nBezPoints;
      xPts = new int[nPts];
      yPts = new int[nPts];
      xPtsf = new float[nPts];
      yPtsf = new float[nPts];
      
      for (int i=0; i<nK; i++){ 

        // determine which knots to consider
        if ((i>0) && (i<nKnotsm2)){
          fph = knots[i-1];
          fpi = knots[i  ];
          fpj = knots[i+1];
          fpk = knots[i+2];	
        } 
        else {
          fpi = knots[i];
          fpj = knots[(i+1)%nK];
          fph = knots[(i-1+ nK)%nK];
          fpk = knots[(i+2)%nK];
        }

        // derive control points x0..x3, y0..y3
        x1 = (x0 = fpi.x) + ((x3 = fpj.x) - fph.x)*SPLINE_BIAS;
        y1 = (y0 = fpi.y) + ((y3 = fpj.y) - fph.y)*SPLINE_BIAS;
        x2 = x3 - (fpk.x - x0)*SPLINE_BIAS;
        y2 = y3 - (fpk.y - y0)*SPLINE_BIAS;

        // add computed Bezier points to the Polygon
        for (int p=0; p<nBezPoints; p++){
          M = matrix[p];
          xPts[n]   = (int)((m1=M[1])*x0 + (m2=M[2])*x1 + (m3=M[3])*x2 + (m0=M[0])*x3);
          yPts[n]   = (int)( m1*y0 +        m2*y1 +        m3*y2 +        m0*y3);
          
          xPtsf[n]   = ((m1=M[1])*x0 + (m2=M[2])*x1 + (m3=M[3])*x2 + (m0=M[0])*x3);
          yPtsf[n]   = ( m1*y0 +        m2*y1 +        m3*y2 +        m0*y3);
          n++;
        }
      }

      // reset the Polygon's fields
      P.xpoints = xPts;
      P.ypoints = yPts;
      P.npoints = nPts;

      // gc.fillPolygon(P);
      beginShape();
      for (int pt=0; pt<nPts; pt++){
        vertex(xPtsf[pt], yPtsf[pt]);
         //vertex(P.xpoints[pt], P.ypoints[pt]);
      }
      endShape(CLOSE);
      


    }
  }


}
