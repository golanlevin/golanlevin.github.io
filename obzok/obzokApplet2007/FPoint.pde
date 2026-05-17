public class FPoint {

  public float x;
  public float y;     

  public FPoint() { 
    x=y=0;
  }
  public FPoint(float x, float y) {
    this.x=x;
    this.y=y;
  }

  public FPoint(FPoint p) {
    this.x=p.x;
    this.y=p.y;
  }

  public final void clear() {
    this.x=0;
    this.y=0;
  }

  public final void set(FPoint fp) {
    this.x=fp.x;
    this.y=fp.y;
  }

  public final void set(float x, float y) {
    this.x=x;
    this.y=y;
  }


  public final void translate(float x, float y) {    
    this.x+=x;
    this.y+=y;
  }

  public final void translate(FPoint f) {    
    this.x+=f.x;
    this.y+=f.y;
  }


  public final void scale(float d) {
    x*=d;
    y*=d;       
  }
  public final void scale(float dx,float dy) {
    x*=dx;
    y*=dy;      
  }

  public final void scale(FPoint f) {
    x*=f.x;
    y*=f.y;       
  }

  public final float magnitude(){
    //return (float) Math.sqrt(x*x + y*y);
    return (x*x + y*y);
  }

  public final void clamp(float bound){
    x = Math.min(bound, Math.max(x, -bound));
    y = Math.min(bound, Math.max(y, -bound));
  }


  public final boolean equals(Object o) {
    if (o instanceof FPoint) {
      FPoint p = (FPoint) o; 
      return (p.x==x) && (p.y==y);
    }
    return false;
  }

  public final String toString() { 
    return "FPoint["+x+","+y+"]"; 
  }



}
