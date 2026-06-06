/*
	Pip 1
*/
// Outer frame (0,0) (580,434)
// Work window (91,5) (484,424)

import java.awt.*;
import java.applet.Applet;
// import java.awt.image.*;
import dag.GUI_lib.*;
import java.util.*;
import java.net.*;

public class PipConstants extends Object
{
	public final static int ArrowTool = 0;
	public final static int PenTool = 1; 
	public final static int ZoomInTool = 2;
	public final static int ZoomOutTool = 3;
	
	public final static int Ink_w = 0;
	public final static int Ink_b = 1;
	public final static int Ink_wdu = 2;
	public final static int Ink_bdu = 3;
	public final static int Ink_wdd = 4;
	public final static int Ink_bdd = 5;
	public final static int Ink_wuu = 6;
	public final static int Ink_buu = 7;
	public final static int Ink_wd = 8;
	public final static int Ink_bd = 9;
	public final static int Ink_wu = 10;
	public final static int Ink_bu = 11;
	public final static int Ink_wc = 12;
	public final static int Ink_bc = 13;

	public final static int white = 0;
	public final static int black = 1; 
	
	public final static int initValueFSA[] = {0,1,0,1,0,1,0,1,0,1,0,1,0,1};
		
	public static int nextValueMouseDownFSA(int FSANo, int currentState) {
		switch (FSANo) {
			case PipConstants.Ink_w : 
				return PipConstants.white;
			case PipConstants.Ink_b :
				return PipConstants.black;
			case PipConstants.Ink_wdu : 
				return PipConstants.black;
			case PipConstants.Ink_bdu : 
				return PipConstants.white;
			case PipConstants.Ink_wdd : 
				if (currentState ==  PipConstants.white) {
					return PipConstants.black;}
				else {
					return PipConstants.white;}
			case PipConstants.Ink_bdd : 
				if (currentState ==  PipConstants.white) {
					return PipConstants.black;}
				else {
					return PipConstants.white;}
			case PipConstants.Ink_wuu : 
				return currentState;
			case PipConstants.Ink_buu : 
				return currentState;
			case PipConstants.Ink_wd : 
				return PipConstants.black;
			case PipConstants.Ink_bd : 
				return PipConstants.white;
			case PipConstants.Ink_wu : 
				return currentState;
			case PipConstants.Ink_bu : 
				return currentState;
			case PipConstants.Ink_wc : 
				return currentState;
			case PipConstants.Ink_bc : 
				return currentState;													
		}  // end switch
		return 0; // will never be reached, but compiler insists!
	} // end method nextValueMouseDownFSA

	public static int nextValueMouseUpFSA(int FSANo, int currentState) {
		switch (FSANo) {
			case PipConstants.Ink_w : 
				return PipConstants.white;
			case PipConstants.Ink_b :
				return PipConstants.black;
			case PipConstants.Ink_wdu : 
				return PipConstants.white;
			case PipConstants.Ink_bdu : 
				return PipConstants.black;
			case PipConstants.Ink_wdd : 
				return currentState;
			case PipConstants.Ink_bdd : 
				return currentState;
			case PipConstants.Ink_wuu : 
				if (currentState ==  PipConstants.white) {
					return PipConstants.black;}
				else {
					return PipConstants.white;}
			case PipConstants.Ink_buu : 
				if (currentState ==  PipConstants.white) {
					return PipConstants.black;}
				else {
					return PipConstants.white;}
			case PipConstants.Ink_wd : 
				return currentState;
			case PipConstants.Ink_bd : 
				return currentState;
			case PipConstants.Ink_wu : 
				return PipConstants.black;
			case PipConstants.Ink_bu : 
				return PipConstants.white;
			case PipConstants.Ink_wc : 
				return currentState;
			case PipConstants.Ink_bc : 
				return currentState;													
		}  // end switch
		return 0; // will never be reached, but compiler insists!
	} // end method nextValueMouseUpFSA

  } // end class 
	
public class Pip1Applet extends dag.GUI_lib.DSApplet
{
/*	public static String ToolIcons[][] = 
	       { {"gifs/arrowtool.gif", "ArrowTool"}, {"gifs/pentool.gif", "PenTool"},
	       	 {"gifs/zoomintool.gif", "ZoomInTool"}, {"gifs/zoomouttool.gif", "ZoomOutTool"} };   */

	public static String ToolIcons[][] = 
	       { {"arrowtool.gif", "ArrowTool"}, {"pentool.gif", "PenTool"},
	       	 {"zoomintool.gif", "ZoomInTool"}, {"zoomouttool.gif", "ZoomOutTool"} };
	
	public static DSTwoStateButton ToolIconRefs[] = new DSTwoStateButton[4];


/*	public static String InkIcons[][] = 
	       { {"gifs/w.gif", "ArrowTool"}, {"gifs/b.gif", "PenTool"},
	         {"gifs/wdu.gif", "ArrowTool"}, {"gifs/bdu.gif", "PenTool"},
	         {"gifs/wdd.gif", "ArrowTool"}, {"gifs/bdd.gif", "PenTool"},
	         {"gifs/wuu.gif", "ArrowTool"}, {"gifs/buu.gif", "PenTool"},
	         {"gifs/wd.gif", "ArrowTool"}, {"gifs/bd.gif", "PenTool"},
	         {"gifs/wu.gif", "ArrowTool"}, {"gifs/bu.gif", "PenTool"},
	       	 {"gifs/wc.gif", "ZoomInTool"}, {"gifs/bc.gif", "ZoomOutTool"} };   
*/

	public static String InkIcons[][] = 
	       { {"w.gif", "ArrowTool"}, {"b.gif", "PenTool"},
	         {"wdu.gif", "ArrowTool"}, {"bdu.gif", "PenTool"},
	         {"wdd.gif", "ArrowTool"}, {"bdd.gif", "PenTool"},
	         {"wuu.gif", "ArrowTool"}, {"buu.gif", "PenTool"},
	         {"wd.gif", "ArrowTool"}, {"bd.gif", "PenTool"},
	         {"wu.gif", "ArrowTool"}, {"bu.gif", "PenTool"},
	       	 {"wc.gif", "ZoomInTool"}, {"bc.gif", "ZoomOutTool"} };  

	public static DSTwoStateButton InkIconRefs[] = new DSTwoStateButton[14];
	
	public static Image InkIconImages[] = new Image[14];
		
	public static int CurrentToolIndex, CurrentInkIndex;
	
	public boolean initialized = false;

	
	DSIcon selectionIcon;
	
	DSWorkArea workArea;

	public DSTwoStateButton createPipIcon(String imageFile, 
							   int x, int y, int w, int h,
							   boolean toggle,
							   String callBackString, int callBackNumber)
								   
	{   Image u,d; DSTwoStateButton ping;
	     
	    u = DS31x31Icons.createUpButtonImage(imageFile, this);
	    d = DS31x31Icons.createDownButtonImage(imageFile, this);
    	ping = new DSTwoStateButton(u, d, toggle, callBackString, callBackNumber, this);
    	ping.move(x,y);
    	ping.resize(w,h);
	   	add(ping);
    	return ping;}
					   									  
	public void init() {
	    
	    URL imageURL, baseURL;
	    
	    resize(580,434);
	    setLayout( new BorderLayout() );
	         	
	    workArea = new DSWorkArea(this);
    	workArea.move(93,7);       // to make sure
    	workArea.resize(480,420);
		add(workArea);
//		workArea.repaint();
     	
		for (int y=0; y < 2; y++) {
			for (int x=0; x < 2; x++) {
			     ToolIconRefs[x+(y*2)] = createPipIcon( ToolIcons[x+(y*2)][0] ,
			     										12+(x*36),32+(y*36),31,31,
			     										true,"ToolSelected",x+(y*2));
 		         }
		    };

		CurrentToolIndex = PipConstants.PenTool;
		ToolIconRefs[CurrentToolIndex].setOnValue(true); 
		
		for (int y=0; y < 7; y++) {
			for (int x=0; x < 2; x++) {
			     InkIconRefs[x+(y*2)] = createPipIcon( InkIcons[x+(y*2)][0] ,
			     										12+(x*36),171+(y*36),31,31,
			     										false,"InkSelected",x+(y*2));
 	         }
		    };
		    
		for (int i=0; i < 14; i++) {
			InkIconImages[i] = DSGetImage(InkIcons[i][0]);			
			
			if (InkIconImages[i] == null) {
				InkIconImages[i] = createImage(21,21);
				InkIconImages[i].getGraphics().setColor(Color.white);
				InkIconImages[i].getGraphics().fillRect(0,0,21,21);};
			; };
					
		selectionIcon = new DSIcon21();
    	selectionIcon.move(34,138);
    	selectionIcon.resize(21,21);
		CurrentInkIndex = PipConstants.Ink_bdu;   //  Black down/up
		selectionIcon.setImage(InkIconImages[CurrentInkIndex]);
		add(selectionIcon);
						
					}
	
	public void paint( Graphics g ) {
		
		g.setColor(Color.gray);
		g.fillRect(0,0,size().width-1, size().height-1);

		g.setColor(Color.black);
		g.fillRect(91,5,484,424);  // work window
		
//		g.setColor(Color.white);
//		g.fillRect(93,7,480,420);  // work area
		
		g.setColor(Color.black);
		g.fillRect(5,5,81,101);  // tool window frame

		g.setColor(Color.lightGray);
		g.fillRect(7,7,77,97);  // tool window inner

		g.setColor(Color.black);
		g.fillRect(5,111,81,318);  // ink window frame

		g.setColor(Color.lightGray);
		g.fillRect(7,113,77,314);  // ink window inner	
		
//	    selection icon = <34,138> , <21,21>
		g.setColor(Color.blue.darker().darker());
		
		int f = 7; int x0 = 34; int y0 = 138;  // frame

		int xarray[] = {x0,x0+21,x0+21+f,x0+21+f,x0+21,x0,x0-f,x0-f};
		int yarray[] = {y0-f,y0-f,y0,y0+21,y0+21+f,y0+21+f,y0+21,y0};		
	    g.fillPolygon(xarray, yarray, 8);
		
//		g.setColor(Color.black);
//		g.drawString("docbase =",10,450);	
//		g.drawString(getDocumentBase().toString(),150,450);	
	}

	public void ToolSelected(int number, Object theObject) {
	 	   	ToolIconRefs[CurrentToolIndex].setOnValue(false);
	 	   	CurrentToolIndex = number;	
	 	    ToolIconRefs[CurrentToolIndex].setOnValue(true);
	 	    workArea.myRepaint();
    }
			
	public void InkSelected(int number, Object theObject) {
	 	   	CurrentInkIndex = number;	
	 	   	selectionIcon.setImage(InkIconImages[CurrentInkIndex]);

    }
			
	public void callBack(String callBackString, int number, Object theObject) {
	    if(callBackString == "ToolSelected") { ToolSelected(number,theObject); }
	    if(callBackString == "InkSelected") { InkSelected(number,theObject); }	    
	}

}



public class DSWorkArea extends dag.GUI_lib.DSCanvas {

	public static final int XSize = 24;
	public static final int YSize = 21;
	
	int editorMatrix[][] = new int[XSize][YSize];
	int runtimeMatrix[][] = new int[XSize][YSize];
	Vector sharedInputMatrix[][] = new Vector[XSize][YSize];
	
	int magnification = 20;
	
	Pip1Applet owner = null;
	
	Image editorImage = null, runtimeImage = null;
	
	public static Vector getAdjecentPixels(int xPos, int yPos) {

		Vector result = new Vector(8);
		for (int x = xPos-1; x < xPos +2; x++) {
			for (int y = yPos-1; y < yPos +2; y++) {
				if ((x >= 0) & (y >= 0) & (x < XSize) & (y < YSize) & !((x==xPos) & (y==yPos))) {
					result.addElement(new Point(x,y)); }}};
		return result;}
			
		
	public DSWorkArea(Pip1Applet ownerIn) {
	
		for(int x = 0; x < XSize; x++) {
			for(int y = 0; y < YSize; y++) {
				editorMatrix[x][y] = 0; }};
		for(int x = 0; x < XSize; x++) {
			for(int y = 0; y < YSize; y++) {
				runtimeMatrix[x][y] = 0; }};
		for(int x = 0; x < XSize; x++) {
			for(int y = 0; y < YSize; y++) {
				sharedInputMatrix[x][y] = null; }};

		owner = ownerIn;
				
	}	


	private void updateInputVectors(int x, int y, boolean isInteractive, boolean wasInteractive) {
		Vector oldVector = null, newVector = null, 
			   adjecencyVector  = null, vectorToBeConcatenated = null;
		Enumeration adjecencyVectorEnum = null, Etemp = null;
		Point cellRef = null, cellRef2 = null;
		Vector firstVector = null;
		
		oldVector = sharedInputMatrix[x][y];
		if (isInteractive & !wasInteractive) {
			if (oldVector == null) {
				adjecencyVector = getAdjecentPixels(x,y);
				adjecencyVectorEnum = adjecencyVector.elements();
				while (adjecencyVectorEnum.hasMoreElements()) { // with all adjecent pixels:
					cellRef = (Point) adjecencyVectorEnum.nextElement();  // CASTING.. Oh God!
					if (editorMatrix[cellRef.x][cellRef.y] > 1) {   // if it is interactive
						if (firstVector == null) {
							firstVector = sharedInputMatrix[cellRef.x][cellRef.y]; }
						else {
						// To come..  Concatenate it with firstVector.. + update refs...
							vectorToBeConcatenated = sharedInputMatrix[cellRef.x][cellRef.y];
							if (!(vectorToBeConcatenated == firstVector)) { // needs to be concatenated.
								Etemp = vectorToBeConcatenated.elements();
								while (Etemp.hasMoreElements()) { // with all pixels in vector:
									cellRef2 = (Point) Etemp.nextElement();  // CASTING.. Oh God!
									firstVector.addElement(cellRef2);  // add to first vector
									sharedInputMatrix[cellRef2.x][cellRef2.y] = firstVector; // update ref.
								} // while
							} // if
								
						}; // else
					};	
				};
				if (firstVector == null) { firstVector = new Vector(1000);};
				firstVector.addElement(new Point(x,y));
				sharedInputMatrix[x][y] = firstVector; 
			}
			}			
		else if (!isInteractive & wasInteractive) {
			    // remove from vectors...
			 	if (!(oldVector == null)) {
			 		sharedInputMatrix[x][y] = null; // empty the ref..
			 		rebuildVectorAround(oldVector,x,y);	// rebuild vector(s) - possible split..
			    }   
			} // end else	
		} // end method


	private void rebuildVectorAround(Vector oldVector, int x, int y) {
		// We have situation where a hole is created. We do not know if the vector
		// elements meet elsewhere such that there will be no split..
		// have to rebuild the whole vector around (x,y) as a MacPaint "fill".
		//
		// Pseudo code:
		// 1. Erase (=null) all vector refs. to the vector that <x,y> belonged to (i.e. oldVector).
		// 2. Erase the vector (i.e. oldVector).
		// 3. With all adjacent *interactive* pixels p to <x,y>:
		// 4. 	  iff p's vectorRef is null (i.e. not yet connected to one of the previous ps):
		// 5.	       Create a new vector and add p to that vector.
		// 6.		   Do a recursive "fill" from p on all interactive pixels with null refs..
		// 7.     end iff
		// 8. End with all... and that's it.

		Enumeration adjecencyVectorEnum = null, Etemp = null;
		Point cellRef = null;
		Vector newVector = null, adjecencyVector = null;

		// 1.
		Etemp = oldVector.elements();
		while (Etemp.hasMoreElements()) { // with all pixels in vector:
			cellRef = (Point) Etemp.nextElement();  // CASTING.. Oh God!
			sharedInputMatrix[cellRef.x][cellRef.y] = null; // null it.
		}; // while
		// 2.
		oldVector = null;  // Will GC pick up this one?
		// 3.
		adjecencyVector = getAdjecentPixels(x,y);
		adjecencyVectorEnum = adjecencyVector.elements();
				while (adjecencyVectorEnum.hasMoreElements()) { // with all adjecent pixels:
					cellRef = (Point) adjecencyVectorEnum.nextElement();  // CASTING.. Oh God!
					if (editorMatrix[cellRef.x][cellRef.y] > 1) {   // if it is interactive
		/* 4. */ 		if (sharedInputMatrix[cellRef.x][cellRef.y] == null) {
		/* 5. */			newVector = new Vector(1000);
		/* 6. */			fillVectorFrom(newVector, cellRef.x, cellRef.y);				
		/* 7. */		} // if
					} // if
		/* 8. */} // while
		} // method
	
	
	private void fillVectorFrom(Vector theVector, int x, int y) {  // Recursive guy !

		Enumeration adjecencyVectorEnum = null;
		Point cellRef = null;
		Vector adjecencyVector = null;

		adjecencyVector = getAdjecentPixels(x,y);
		adjecencyVectorEnum = adjecencyVector.elements();
				while (adjecencyVectorEnum.hasMoreElements()) { // with all adjecent pixels:
					cellRef = (Point) adjecencyVectorEnum.nextElement();  // CASTING.. Oh God!
					if (editorMatrix[cellRef.x][cellRef.y] > 1) {   // if it is interactive
				 		if (sharedInputMatrix[cellRef.x][cellRef.y] == null) {
							theVector.addElement(cellRef);                      // Add to vector
							sharedInputMatrix[cellRef.x][cellRef.y] = theVector;// Set ref.
							fillVectorFrom(theVector, cellRef.x, cellRef.y);  // recursive..				
						} // if
					} // if
				} // while		
		}  // method
	
	private void cellIsClicked(int x, int y) {
	    Graphics g;

        Graphics gContext;
        int oldInk;
        
        if (Pip1Applet.CurrentToolIndex == PipConstants.PenTool) {

			gContext = editorImage.getGraphics();
		    g = getGraphics();
		    oldInk = editorMatrix[x][y];
			if (!(oldInk == Pip1Applet.CurrentInkIndex)) {
				editorMatrix[x][y] = Pip1Applet.CurrentInkIndex;
				gContext.drawImage(Pip1Applet.InkIconImages[Pip1Applet.CurrentInkIndex],
						   x*magnification,y*magnification, null);
				g.drawImage(Pip1Applet.InkIconImages[Pip1Applet.CurrentInkIndex],
						   x*magnification,y*magnification, null);
//	    g.drawImage(editorImage,0,0, null); 
       			};
       		runtimeMatrix[x][y] = PipConstants.initValueFSA[Pip1Applet.CurrentInkIndex];
       		updateInputVectors(x,y,(Pip1Applet.CurrentInkIndex > 1), (oldInk > 1));
    	}				
	}

	public void updateRuntimeImage(int x, int y) {
		gContext = runtimeImage.getGraphics();
	  	if (runtimeMatrix[x][y] == PipConstants.black) {
	  		gContext.setColor(Color.black);}
	  	else {
	  		gContext.setColor(Color.white);};
	    gContext.fillRect(x*magnification,y*magnification,magnification,magnification);
		}

	public void drawRuntimeImage() {
		getGraphics().drawImage(runtimeImage,0,0, null); }
		
	public boolean interactiveCellMouseDown(int x, int y) {
		int oldState, newState, FSANo;
		
        if (Pip1Applet.CurrentToolIndex == PipConstants.ArrowTool) {
			oldState = runtimeMatrix[x][y];
			FSANo = editorMatrix[x][y];
			newState = PipConstants.nextValueMouseDownFSA(FSANo, oldState);
			if (!(newState == oldState)) {
				runtimeMatrix[x][y] = newState;
				updateRuntimeImage(x,y);};
				return true;};
		return false;
	}

	public boolean	cellMouseDown(int x, int y) {
		boolean changed = false;
		Vector inputVector;
		Enumeration inputVectorEnum;
		Point cellRef;
		
		inputVector = sharedInputMatrix[x][y];
		if (inputVector == null) {
			changed = interactiveCellMouseDown(x, y);}
		else {
			inputVectorEnum = inputVector.elements();
			while (inputVectorEnum.hasMoreElements()) {
				cellRef = (Point) inputVectorEnum.nextElement();  // CASTING.. Oh God!
				if (interactiveCellMouseDown(cellRef.x, cellRef.y)) {
					changed = true;};};
				};
		if (changed) {
			drawRuntimeImage();};
		return true; }


	
	public boolean interactiveCellMouseUp(int x, int y) {
		int oldState, newState, FSANo;
		
        if (Pip1Applet.CurrentToolIndex == PipConstants.ArrowTool) {
			oldState = runtimeMatrix[x][y];
			FSANo = editorMatrix[x][y];
			newState = PipConstants.nextValueMouseUpFSA(FSANo, oldState);
			if (!(newState == oldState)) {
				runtimeMatrix[x][y] = newState;
				updateRuntimeImage(x,y);};
				return true; };
		return false;
	}

	public boolean	cellMouseUp(int x, int y) {
		boolean changed = false;
		Vector inputVector;
		Enumeration inputVectorEnum;
		Point cellRef;
		
		inputVector = sharedInputMatrix[x][y];
		if (inputVector == null) {
			changed = interactiveCellMouseUp(x, y);}
		else {
			inputVectorEnum = inputVector.elements();
			while (inputVectorEnum.hasMoreElements()) {
				cellRef = (Point) inputVectorEnum.nextElement();  // CASTING.. Oh God!
				if (interactiveCellMouseUp(cellRef.x, cellRef.y)) {
					changed = true;};};
				};
		if (changed) {
			drawRuntimeImage();};
		return true; }


	public boolean mouseButtonIsDown(int x, int y)
	{ 
	    if((x >= 0) & (x < size().width) & (y >= 0) & (y < size().height)) {
	    	cellIsClicked(x / magnification, y / magnification);};	
		return true;
	}


	public boolean	mouseDownEvent(int x, int y)
	{ 
	    if((x >= 0) & (x < size().width) & (y >= 0) & (y < size().height)) {
	    	cellMouseDown(x / magnification, y / magnification);};	
		return true;
	}

	public boolean	mouseUpEvent(int x, int y)
	{ 
	    if((x >= 0) & (x < size().width) & (y >= 0) & (y < size().height)) {
	    	cellMouseUp(x / magnification, y / magnification);};	
		return true;
	}

	public void updateRuntimeImage() {
		gContext = runtimeImage.getGraphics();
		for(int x = 0; x < 24; x++) {
	  		for(int y = 0; y < 21; y++) {
	  		    runtimeMatrix[x][y] = PipConstants.initValueFSA[editorMatrix[x][y]];
	  			if (runtimeMatrix[x][y] == PipConstants.black) {
	  			   gContext.setColor(Color.black);}
	  			else {
	  			   gContext.setColor(Color.white);};
	  		    gContext.fillRect(x*magnification,y*magnification,magnification,magnification);}};
		}
		
	public void myRepaint() {
	  	paint(this.getGraphics()); }
	  								 
	public void	paint(Graphics g)
	{   Graphics gContext; MediaTracker mt;
	
	// if pip.tool = edit...
	
    	  if (editorImage == null) {
			editorImage = owner.createImage(size().width,size().height);
			mt=new MediaTracker(this);
    		mt.addImage(editorImage,0);
    		try {mt.waitForAll();}
    		catch (InterruptedException dummy) { owner.showStatus("DS - Error creating editorimage " ); };        
           
		    gContext = editorImage.getGraphics();
			for(int x = 0; x < 24; x++) {
	  			for(int y = 0; y < 21; y++) {
					gContext.drawImage(Pip1Applet.InkIconImages[editorMatrix[x][y]],
									   x*magnification,y*magnification, null );}};};	
									   
    	  if (runtimeImage == null) {
			runtimeImage = owner.createImage(size().width,size().height);};	
			mt=new MediaTracker(this);
    		mt.addImage(runtimeImage,0);
    		try {mt.waitForAll();}
    		catch (InterruptedException dummy) { owner.showStatus("DS - Error creating runtimeImage " ); };        
									   						   
	    if (Pip1Applet.CurrentToolIndex == PipConstants.PenTool) {
									   g.drawImage(editorImage