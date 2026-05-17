import java.util.*;

public class ImplicitFinder{

  public  /* static */ int squareSize;
  private /* static */ final int CONVERGE_TESTS = 4;
  private /* static */ final int MAX_BOUNDARY_LENGTH = 1000;


  private float threshold;
  private Skeleton S;
  Vector links, joints;
  int nLinks, nJoints;
  private float Ax, Ay, Bx, By;
  private FPoint A, B;

  public ImplicitFinder(){
    squareSize = 30;
    setThreshold(0.25f);
    S = null;
  }

  public void setSkeleton (Skeleton sk){ 
    S = sk; 
  }
  public void setThreshold (float th){
    threshold = th;
  }
  public void setSquareSize (int sq) {
    squareSize = sq;
  }

  private float lef, top, rit, bot; // temps

  public Polygon computeBoundarySquarePolygon(){
    // given a Point containing the row and column
    // of a square containing a source, search outward from the
    // source until we find a square which contains the edge of
    // the implicit curve; then trace along that edge, in search of
    // the other squares which contain the edge; for each such
    // square, represent its row and column in a Point, and store this
    // Point in a polygon

      Polygon boundarySquarePoly = new Polygon();

    if ((S != null) && (S.nLinks > 0)){
      nLinks = S.nLinks;
      links = S.links;
      joints = S.joints;
      nJoints = S.nJoints;

      Point startSquare;
      int startRow, startCol;
      int edgeRow, edgeCol;
      int prevRow, prevCol;
      int col, row;

      FPoint edgePoint;
      boolean incomplete;
      byte edge = 3;
      byte b;

      FPoint fp0 = ((Joint)(S.joints.elementAt(0))).position;
      int sqx = (int)(fp0.x/squareSize);
      int sqy = (int)(fp0.y/squareSize);

      startSquare = findFirstSquareContainingEdge(sqx, sqy);
      startCol = col = startSquare.x;
      startRow = row = startSquare.y;
      incomplete = true;
      int nsegs = 1;

      do{
        prevRow = row; 
        prevCol = col;

        //this block is an inlined version of:
        //b = evaluateSquare(col, row);
        b = 0;
        lef = col*squareSize;
        top = row*squareSize;
        rit = lef + squareSize;
        bot = top + squareSize;
        if (getFieldValueAtLocation(rit, bot) < threshold){ 
          b|=1;
        }
        if (getFieldValueAtLocation(rit, top) < threshold){ 
          b|=2;
        }
        if (getFieldValueAtLocation(lef, top) < threshold){ 
          b|=4;
        } 
        if (getFieldValueAtLocation(lef, bot) < threshold){ 
          b|=8;
        }

        switch(b){
        case 1: 
        case 9:  
        case 13:			
          col++;	
          edge = 3;	
          break;	// to RIGHT  
        case 2: 
        case 3:  
        case 10: 
        case 11: 	
          row--;	
          edge = 6;	
          break; 	// to UP;
        case 4: 
        case 5:  
        case 6:  
        case 7:	
          col--;	
          edge = 12;	
          break; 	// to LEFT;
        case 8: 
        case 12: 
        case 14:			
          row++;	
          edge = 9;	
          break;	// to DOWN;	
        case 0: 
        case 15: 
          break;
        }

        edgePoint = converge(prevCol, prevRow, edge);
        edgeCol = col;
        edgeRow = row;

        if (nsegs > MAX_BOUNDARY_LENGTH) { 
          incomplete = false; 
          // can't find the original startPoint.  abort the search with a hack.
        } 
        else {
          if (!((startCol==edgeCol) && (startRow==edgeRow))){
            boundarySquarePoly.addPoint((int)edgePoint.x, (int)edgePoint.y);
            nsegs++;
          } 
          else { 
            incomplete = false; 
            // edge has looped around.
          } 
        }

      } 
      while (incomplete);
    }
    return boundarySquarePoly;

  }


  //--------------------------------------------------------------------------
  private Point findFirstSquareContainingEdge (int col, int row){
    // given the row and column of a square containing a source,
    // find the row and column of the first-discovered square 
    // near the source which contains the implicit edge
    int i, j;
    int s=0;
    int x=0; 
    int y=0;
    byte b;
    boolean foundSquare = false;
    while (foundSquare == false){

      for (i= (col-s); i<=(col+s); i++){ // do horizontal periphery
        j = (row-s); 
        b = evaluateSquare(i, j);
        if (b>0) { 
          foundSquare = true; 
          x=i; 
          y=j;
          break; 
        }

        j = (row+s); 
        b = evaluateSquare(i, j);
        if (b>0) { 
          foundSquare = true; 
          x=i; 
          y=j;
          break; 
        }
      }

      for (j= (row-s+1); j<=(row+s-1); j++){ // do vertical periphery
        i = (col-s); 
        b = evaluateSquare(i, j);
        if (b>0) { 
          foundSquare = true; 
          x=i; 
          y=j; 
          break; 
        }

        i = (col+s); 
        b = evaluateSquare(i, j);
        if (b>0) { 
          foundSquare = true; 
          x=i; 
          y=j; 
          break; 
        }
      }
      s++;
    }

    Point p = new Point (x, y);
    return p;
  }


  //----------------------------------------------------------------------------
  private byte evaluateSquare(int col, int row){
    // return a byte indicating the flavor of the square
    byte b = 0;
    lef = col*squareSize;
    top = row*squareSize;
    rit = lef + squareSize;
    bot = top + squareSize;
    if (getFieldValueAtLocation(rit, bot) < threshold){ 
      b|=1; 
    }
    if (getFieldValueAtLocation(rit, top) < threshold){ 
      b|=2; 
    }
    if (getFieldValueAtLocation(lef, top) < threshold){ 
      b|=4; 
    }
    if (getFieldValueAtLocation(lef, bot) < threshold){ 
      b|=8; 
    }
    return b;
  }


  //----------------------------------------------------------------------------
  private float getFieldValueAtLocation2(float Cx, float Cy){
    // uses implicit lines. takes a vector of Links 
    // (lines defined by two points).

    float r, L;
    float dx, dy, dh;
    Link K;

    float val = 0;
    for (int i=0; i<nLinks; i++){
      K = (Link) links.elementAt(i);
      if (K.onBoundary){

        A = K.fp0; 
        B = K.fp1;
        Ax = A.x; 
        Ay = A.y;
        Bx = B.x; 
        By = B.y;
        dx = (Bx-Ax);
        dy = (By-Ay);

        if ((L=(dx*dx + dy*dy))>0){
          r = ((Cx-Ax)*(Bx-Ax)+(Cy-Ay)*(By-Ay))/L;

          if (r <= 0){
            dx = (Ax-Cx);
            dy = (Ay-Cy);
            dh = (dx*dx + dy*dy);
            val += (1f/((dh<1)?1:dh));

          } 
          else if (r >= 1){
            dx = (Bx-Cx);
            dy = (By-Cy);
            dh = (dx*dx + dy*dy);
            val += (1f/((dh<1)?1:dh));

          } 
          else {
            dx = ((Ax + r*(Bx-Ax))-Cx);
            dy = ((Ay + r*(By-Ay))-Cy);
            dh = (dx*dx + dy*dy);
            val += (1f/((dh<1)?1:dh));
          }
        }

      }
    }
    return val;
  }



  private float getFieldValueAtLocation(float Cx, float Cy){
    // using point sources only, no implicit lines.

    float dx, dy, dh;
    Joint J;

    float val = 0;
    for (int i=0; i<nJoints; i++){
      J = (Joint) joints.elementAt(i);
      A = J.position;
      Ax = A.x; 
      Ay = A.y;
      dx = (Cx-Ax);
      dy = (Cy-Ay);
      dh = (dx*dx + dy*dy);
      val += (1f/((dh<1)?1:dh));
    }
    return val;
  }







  //----------------------------------------------------------------------------
  private FPoint rootPoint = new FPoint();
  private FPoint converge(int col, int row, byte edge){
    // edge must be a byte valued at either 3, 6, 9 or 12
    // and indicates which edge is to be searched for the edge boundary

    float x1 = 0; 
    float x2 = 0;
    float y1 = 0; 
    float y2 = 0;
    float px = 0; 
    float py = 0;
    float lox = 0; 
    float loy = 0;
    float hix = 0; 
    float hiy = 0;

    float lef = col*squareSize;
    float top = row*squareSize;
    float rit = lef + squareSize;
    float bot = top + squareSize;

    switch (edge){
    case 3:	// right edge
      x1 = rit; 
      x2 = rit;
      y1 = bot; 
      y2 = top;
      break;
    case 6:	 // top edge
      x1 = lef; 
      x2 = rit;
      y1 = top; 
      y2 = top;
      break;
    case 9:	 // bottom edge
      x1 = rit; 
      x2 = lef;
      y1 = bot; 
      y2 = bot;
      break;
    case 12: // left edge
      x1 = lef; 
      x2 = lef;
      y1 = bot; 
      y2 = top;
      break;
    }


    if (getFieldValueAtLocation(x1, y1) <= getFieldValueAtLocation(x2, y2)){
      lox = x1; 
      loy = y1; 
      hix = x2; 
      hiy = y2; 
    }
    else { 
      lox = x2; 
      loy = y2; 
      hix = x1; 
      hiy = y1; 
    }


    for (int i=0; i<CONVERGE_TESTS; i++){
      px = (lox + hix)/2f;
      py = (loy + hiy)/2f;
      if (getFieldValueAtLocation(px, py) >= threshold) { 
        hix = px; 
        hiy = py;
      }
      else {
        lox = px; 
        loy = py;
      }
    }

    rootPoint.set(px, py);
    return rootPoint;
  }


}
