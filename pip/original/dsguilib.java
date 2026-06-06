package dag.GUI_lib;

import java.awt.*;
import java.applet.Applet;
// import java.awt.image.*;
import java.net.*;

public class DSApplet extends java.applet.Applet {

	public Image DSGetImage(String filename)
	
{
	Image result;	
	result = getImage(getDocumentBase(), filename);
	MediaTracker mt=new MediaTracker(this);
    mt.addImage(result,0);
    try {mt.waitForAll();}
    	catch (InterruptedException dummy) { this.showStatus("DS - Error loading " + filename); };        
           
   	return result;}	

	public void callBack(String callBackString,int callBackNumber, Object theObject) {
	}
  }

public class DSCanvas extends java.awt.Canvas {

protected Graphics gContext;
int LastX = 0, LastY = 0;

	public boolean
	mouseButtonIsDown(
		int x, 
		int y)
	{ 
		return true;  // Subclass responsibility
	}


	public boolean mouseDownEvent(int x, int y)
	{ 
		return true;  // Subclass responsibility
	}

	public boolean mouseUpEvent(int x, int y)
	{ 
		return true;  // Subclass responsibility
	}

	public boolean
	mouseUp(
		Event evt, 
		int x, 
		int y)
	{ this.mouseUpEvent(x, y);
		return true;}
	

	public boolean
	mouseDown(
		Event evt, 
		int x, 
		int y)
	{   
		this.mouseDownEvent(x, y);
		gContext = getGraphics();  // Used elsewhere.. (bad code)...
		LastX = x;
		LastY = y;
		mouseButtonIsDown(x,y);
		return true;
	}


	public boolean
	mouseDrag(
		Event evt, 
		int x, 
		int y)
	{
	int Xdiff = 0, Ydiff = 0, Xabs = 0, Yabs = 0;
	
	if (!((x==LastX) & (y==LastY))) {
		Xdiff = x - LastX;
		Ydiff = y - LastY;
		Xabs = Math.abs(Xdiff);
		Yabs = Math.abs(Ydiff);
		if (Xabs > Yabs) {
			if (x > LastX) {
		       for (int i = 1; i < Xabs; i++) {
		            mouseButtonIsDown(LastX+i,LastY + ((Ydiff * i) / Xabs));};
		            } 
		    else {
		       for (int i = 1; i < Xabs; i++) {
		            mouseButtonIsDown(LastX-i,LastY + ((Ydiff * i) / Xabs));}
		            }} 
		else {
			if (y > LastY) {
		       for (int i = 1; i < Yabs; i++) {
		            mouseButtonIsDown(LastX + ((Xdiff * i) / Yabs), LastY+i);}
		            }
		       else {
		    for (int i = 1; i < Yabs; i++) {
		            mouseButtonIsDown(LastX + ((Xdiff * i) / Yabs), LastY-i);}
		            }
        }
		            
		LastX = x;
		LastY = y;
		mouseButtonIsDown(x,y);
	  }		
		return true;
	}
	
}	


public class DSIcon extends dag.GUI_lib.DSCanvas {

	boolean inside = false;
	Image icon = null;
	
	public DSIcon(String iconFileName, DSApplet  a )
	{
	    icon = a.DSGetImage(iconFileName);
	}
		

	public DSIcon()
	{	}
		
	public void setImage(Image i)
	{ 	icon = i;
		repaint(); }
		
	public void paint(
		Graphics g)
	{
       	if (icon != null) {
        	g.drawImage(icon, 0, 0, null);}
        else {
        	g.setColor(Color.white);
        	g.fillRect(0,0,size().width,size().height);};
	}
	
	
}

public class DSIcon21 extends dag.GUI_lib.DSIcon {

		
	public void paint(
		Graphics g)
	{
       	if (icon != null) {
       	    g.clipRect(1,1,19,19);
        	g.drawImage(icon, 0, 0, null);}
        else {
        	g.setColor(Color.white);
        	g.fillRect(0,0,size().width,size().height);};
	}
	
	
}

public class DSTwoStateButton extends java.awt.Canvas {

	boolean isUp = true;
	Image upImage = null, downImage =  null;
	boolean isToggle = false;
	boolean isOn = false;
	String callBackString = "";
	int callBackNumber = 0;
	DSApplet owner = null;

	public DSTwoStateButton(Image u, Image d, 
	                        boolean toggle, String callBackStringIn, int callBackNumberIn,
	                        DSApplet a)
	{
	    upImage = u; downImage = d;
	    isToggle = toggle;
	    owner = a;
	    callBackNumber = callBackNumberIn;
	    callBackString = callBackStringIn;  // mouseup => owner.callBack(string, n, this)
	}
		
	public void setOnValue(boolean value)
	{	isOn = value;
	    repaint(); }
	
	
	public void	paint(Graphics g)
	{	if (isUp) {
       	    if (upImage != null) {
        	    g.drawImage(upImage, 0, 0, null); }}
        else {
       	    if (downImage != null) {
        	    g.drawImage(downImage, 0, 0, null); }}
        	
        if (isOn) {
        	g.setXORMode(Color.black);
        	g.setColor(Color.black);
        	g.fillRect(2,2,27,27);
        	g.setPaintMode(); }
	}
	
	public boolean   // Default = PushButton
	mouseDown(
		Event evt, 
		int x, 
		int y)
	{ 
		isUp = false;
		repaint();
		return true;
	}

	public boolean   // Default = PushButton
	mouseUp(
		Event evt, 
		int x, 
		int y)
	{ 
		isUp = true;
		if (isToggle) {isOn = ! isOn;};
		repaint();
		owner.callBack(callBackString, callBackNumber, this);
		return true;
	}
}		

public class DS31x31Icons extends Object {

	static public Image createUpButtonImage(String iconFileName, DSApplet a) {
			Image icon = null, upButtonImage = null, resultImage =  null;
			Graphics g =  null;
			
			resultImage = a.createImage(31,31);
			MediaTracker mt=new MediaTracker(a);
    		mt.addImage(resultImage,0);
    		try {mt.waitForAll();}
    		catch (InterruptedException dummy) { a.showStatus("DS - Error creating image "); };        

			g = resultImage.getGraphics();			
		    icon = a.DSGetImage(iconFileName);
 		    upButtonImage = a.DSGetImage("upicon31.gif");
		    
            if (!(icon == null) & !(upButtonImage == null)) {          
			    g.drawImage(upButtonImage,0,0, null);
			    g.clipRect(6,6,19,19);
			    g.drawImage(icon,5,5, null);};
		    return resultImage;	}	    
		    		    
	static public Image createDownButtonImage(String iconFileName, DSApplet a) {
			Image icon = null, upButtonImage = null, resultImage = null;
			Graphics g = null;
			
			resultImage = a.createImage(31,31);
			MediaTracker mt=new MediaTracker(a);
    		mt.addImage(resultImage,0);
    		try {mt.waitForAll();}
    		catch (InterruptedException dummy) { a.showStatus("DS - creating image "); };        

			g = resultImage.getGraphics();
			
		    icon = a.DSGetImage(iconFileName);
		    upButtonImage = a.DSGetImage("downicon31.gif");
		    
            if (!(icon == null) & !(upButtonImage == null)) {          
			    g.drawImage(upButtonImage,0,0, null);
			    g.clipRect(6,6,19,19);
			    g.drawImage(icon,6,6, null);};
		    return resultImage;	}	    
		    		    		    
	}
