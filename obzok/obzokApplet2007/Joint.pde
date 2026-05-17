public class Joint {

  public FPoint 	position;
  public FPoint 	displacement;
  public FPoint 	velocity;
  public int		id;


  private final float K = 0- (0.09f + (float)(0.02 * (Math.random()-0.5))); 
  private final float D = 0.945f + (float)(0.025 * (Math.random()-0.5)); //0.975f; 
  private static final float MAX_VELOCITY = 10f;

  public Joint(float x, float y, int i){
    position = new FPoint(x, y);
    velocity = new FPoint();
    displacement = new FPoint();
    id = i;
  }


  public void draw(){
    int x = (int) position.x;
    int y = (int) position.y;
    noStroke();
    // fill (127,127,127);
    fill (blobPalette[int(nIB * 0.6)]);
    
    ellipse(x, y, 7, 7);
  }

  public void set(float x, float y){ 
    position.set(x, y);
  }
  public void addDisplacement(float dx, float dy){ 
    displacement.translate(dx, dy);
  }
  public float getDisplacementSquared(){
    return (displacement.x*displacement.x + displacement.y*displacement.y);
  }


  private float mtx, mty, mth;
  private static final float MOVE_TOWARDS_ALPHA = 0.75f;
  private static final float MOVE_TOWARDS_BETA = (1.0f - MOVE_TOWARDS_ALPHA);
  private static final float MAX_MOVEMENT = 16;

  public void moveTowards(float x, float y){
    mtx = (x - position.x);
    mty = (y - position.y);
    mth = Math.min(1.0f, MAX_MOVEMENT/(float)Math.sqrt(mtx*mtx + mty*mty));
    position.x += mtx*mth;
    position.y += mty*mth;
  }



  private float forceX, forceY;
  public void update(){
    forceX = K*displacement.x;
    forceY = K*displacement.y;
    velocity.scale(D);
    velocity.translate(forceX, forceY);
    velocity.clamp(MAX_VELOCITY);
    position.translate(velocity);
    displacement.clear();
  }




}
