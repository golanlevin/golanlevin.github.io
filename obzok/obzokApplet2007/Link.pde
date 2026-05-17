public class Link {

  public Joint 	j0;
  public Joint 	j1;
  public FPoint 	fp0;
  public FPoint 	fp1;
  public boolean 	onBoundary;
  public float 	restLength;


  private float 	dx;
  private float 	dy;
  private float 	dh;
  private float 	stretch;
  private float 	strength;
  private float 	restLength0;

  public Link(Joint p0, Joint p1, boolean b, float s) {
    j0 = p0;
    j1 = p1;
    fp0 = j0.position;
    fp1 = j1.position;
    onBoundary = b;

    dx = fp0.x - fp1.x;
    dy = fp0.y - fp1.y;
    dh = (float) Math.sqrt(dx*dx + dy*dy);
    restLength0 = dh;
    restLength = dh;

    stretch = 0;
    strength = s;
  }


  public void wiggle(float amount, float speed) {
    double t= millis()/speed;
    restLength = restLength0 * (1.0f + amount*(float)(Math.sin(t)));
  }

  public void update() {
    dx = fp0.x - fp1.x;
    dy = fp0.y - fp1.y;
    dh = (float) Math.sqrt(dx*dx + dy*dy);
    if (dh == 0) {
      dh = 0.1f;
    }
    stretch = (dh - restLength)*strength;

    float fx = (dx/dh)*stretch;
    float fy = (dy/dh)*stretch;
    j0.addDisplacement( fx, fy);
    j1.addDisplacement(-fx, -fy);
  }




  public void flipBoundary() {
    onBoundary = !onBoundary;
  }

  public void draw() {
    int x0 = (int) fp0.x;
    int y0 = (int) fp0.y;
    int x1 = (int) fp1.x;
    int y1 = (int) fp1.y;
    
    stroke(blobPalette[int(nIB * 0.8)]);

  /*
    if (onBoundary) { 	
      stroke(255, 0, 0);
    } else { 				
      stroke(0, 255, 0);
    }
    */
    line(x0, y0, x1, y1);
  }
}
