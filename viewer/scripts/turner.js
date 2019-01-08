﻿var sceneObj               = null;
var currentSkybox          = null;
var currentSkyboxScale     = null;
var currentSkyboxBlurLevel = null;


var isFirefoxOrIceweasel = navigator.userAgent.indexOf("Firefox")   >= 0 ||
						   navigator.userAgent.indexOf("Iceweasel") >= 0;
						   
if (isFirefoxOrIceweasel)
{
	//assume we are inside an iframe
	window.addEventListener("DOMMouseScroll", function(e){
		e.preventDefault();	
	});
}
else
{
	//assume we are inside an iframe
	window.addEventListener("mousewheel", function(e)
	{
		e.preventDefault();	
	});
}

var viewerIsReadyCallbacks = [];

var viewerReady = false;

function emitViewerReady()
{
    viewerReady = true;
    
    for (var i = 0; i < viewerIsReadyCallbacks.length; ++i)
    {
        viewerIsReadyCallbacks[i]();
    }
};

function loadScene() {
    if (engine) {
        engine.dispose();
    }

    engine = new BABYLON.Engine(canvas, true);
    engine.enableOfflineSupport = false;

    var rootUrl  = "";    
    var fileName = "scene.gltf";

    //set the following to false in order to hide the animated loading screen
    BABYLON.SceneLoader.ShowLoadingScreen = true;
    
    BABYLON.SceneLoader.ForceFullSceneLoadingForIncremental = true;    
    
    var xhr = new XMLHttpRequest();
    xhr.open("GET", fileName, true);
    xhr.send();
    
    xhr.onload = function()
    {    
        // check glTF extras for object space normals
        var sceneJSON = JSON.parse(xhr.responseText);
        
        var useObjectSpaceNormalMap = false;
        
        if (sceneJSON.materials[0] && sceneJSON.materials[0].normalTexture)
        {
            var normalTextureJSON    = sceneJSON.materials[0].normalTexture;        
             useObjectSpaceNormalMap = normalTextureJSON.extras && normalTextureJSON.extras.objectSpaceNormals;
        }
            
        BABYLON.SceneLoader.Load(rootUrl, fileName, engine, function (scene) {
            
            sceneObj = scene;
            
            sceneObj.clearColor = new BABYLON.Color4(1.0, 1.0, 1.0, 1.0);
            
            var mainMesh = new BABYLON.Mesh("mainModelMesh", sceneObj);
            
            var sceneBBMin = new BABYLON.Vector3( Number.MAX_VALUE,  Number.MAX_VALUE,  Number.MAX_VALUE);
            var sceneBBMax = new BABYLON.Vector3(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE);
                    
            sceneObj.meshes.forEach(function(mesh)
            {
                if (mesh !== mainMesh && mesh.material)
                {
                    mesh.material.forceIrradianceInFragment = true;
                
                    mesh.material.cameraExposure          = 1.2;
                    mesh.material.cameraContrast          = 1.5;
                    mesh.material.backFaceCulling         = false;
                    
                    if (useObjectSpaceNormalMap)
                    {
                        mesh.material.useObjectSpaceNormalMap = true;        
                    }
                                        
                    mesh.computeWorldMatrix(true);
                    var minBox = mesh.getBoundingInfo().boundingBox.minimumWorld;
                    var maxBox = mesh.getBoundingInfo().boundingBox.maximumWorld;
                    BABYLON.Tools.CheckExtends(minBox, sceneBBMin, sceneBBMax);
                    BABYLON.Tools.CheckExtends(maxBox, sceneBBMin, sceneBBMax);
                    
                    mesh.setParent(mainMesh);
                }
            });
			
            var centerVec  = sceneBBMax.subtract(sceneBBMin);
            var bSphereRad = centerVec.length() * 0.5;
            var bbCenter   = sceneBBMin.add(centerVec.multiplyByFloats(0.5, 0.5, 0.5));
                    
            var refScale    = 3.5;
            var scaleFactor = refScale / (2.0 * bSphereRad);
                        
            mainMesh.scaling = new BABYLON.Vector3(scaleFactor, scaleFactor, scaleFactor);
            mainMesh.translate(bbCenter.negate(), BABYLON.Space.WORLD);            
                        
            // these values will be overridden anyway when we set the position
            var alpha  = 0;
            var beta   = 0;
            var radius = 3;
            
            camera = new BABYLON.ArcRotateCamera("camera", alpha, beta, radius, BABYLON.Vector3.Zero(), sceneObj);
            
            var sceneCenter = new BABYLON.Vector3(0,0,0);//bbCenter.multiplyByFloats(scaleFactor, scaleFactor, scaleFactor);
                        
            var refDist       = (0.5 * refScale) / Math.tan(0.5 * camera.fov);
            var cameraInitPos = sceneCenter.add(new BABYLON.Vector3(0,0, refDist));
                        
            camera.setPosition(cameraInitPos);
            camera.setTarget(sceneCenter);
            
            camera.lowerRadiusLimit = refDist * 0.3;
            camera.upperRadiusLimit = refDist * 1.5;
            		
            camera.minZ = camera.lowerRadiusLimit * 0.1;
            camera.maxZ = camera.upperRadiusLimit * 10.0;
			
            camera.wheelPrecision *= 20;
            camera.pinchPrecision *= 20;
                        
            camera.attachControl(canvas, true);   
			
			
			// setup environment
			sceneObj.environmentTexture = new BABYLON.CubeTexture.CreateFromPrefilteredData("images/environment.dds", sceneObj);    
			
			currentSkyboxScale     = 4.0 * camera.upperRadiusLimit;
			currentSkyboxBlurLevel = 0.5;
			
			currentSkybox = sceneObj.createDefaultSkybox(sceneObj.environmentTexture, true, currentSkyboxScale, currentSkyboxBlurLevel);

            emitViewerReady();

            engine.runRenderLoop(function () {
                sceneObj.render();
            });
        });
    }
}


/************************************************************/
/************************ VIEWER API ************************/
/************************************************************/

/**
 * Tells whether the viewer is already initialized.
 */
var viewerIsReady = function()
{
    return viewerReady;
};
 
/**
 * Adds a callback that is executed whenever the viewer is ready.
 * If the viewer is already ready, it is executed right away.
 */
var addIsReadyCallback = function(callback)
{
    viewerIsReadyCallbacks.push(callback);
    
    if (viewerIsReady())
    {
        callback();
    }
}; 
 
/**
 * switches the display of the 3D environment on or off
 */
var toggle3DBackground = function(toggled)
{
    if (toggled && currentSkybox == null)
    {
        currentSkybox = sceneObj.createDefaultSkybox(sceneObj.environmentTexture, true, currentSkyboxScale, currentSkyboxBlurLevel);
    }
    else if (!toggled && currentSkybox != null)
    {
        currentSkybox.dispose();
        currentSkybox = null;
    }
};

/************************************************************/

/**
 * Sets the 3D environment map to be used, must be a ".dds"
 * or ".env" file compatible with BabylonJS.
 */
var setEnvironmentMap = function(envFile)
{
    if (sceneObj.environmentTexture)
    {
        sceneObj.environmentTexture.dispose();
    }
    sceneObj.environmentTexture = new BABYLON.CubeTexture.CreateFromPrefilteredData(envFile, sceneObj);    			    
    
    if (currentSkybox != null)
    {
        currentSkybox.dispose();
        currentSkybox = sceneObj.createDefaultSkybox(sceneObj.environmentTexture, true, currentSkyboxScale, currentSkyboxBlurLevel);
    }    
};

/************************************************************/

/**
 * Switches the display of the given element on or off
 */
var toggleElementVisibility = function(elementID, toggled)
{
    var elem = document.getElementById(elementID);
    
    if (!elem)
    {
        console.error("Cannot find element with ID \"" + elementID + "\".");
        return;
    }
    
    if (toggled)
    {
        elem.style.visibility = "visible";
    }
    else
    {
        elem.style.visibility = "hidden";
    }
};

/************************************************************/

/**
 * positions the given 2D element through CSS, using the given
 * values for sides and px offsets
 * example: "top" and "3px" means "top: 3px;" in cSS
 */
var setElementPosition = function(elementID,
                                  horizontalSide,   verticalSide,
                                  horizontalOffset, verticalOffset)
{
    var elem = document.getElementById(elementID);
    
    if (!elem)
    {
        console.error("Cannot find element with ID \"" + elementID + "\".");
        return;
    }
    
    var otherHSide = (horizontalSide == "left") ? "right"  : "left";
    var otherVSide = (verticalSide   == "top")  ? "bottom" : "top";
    
    elem.style[otherHSide]     = "";
    elem.style[otherVSide]     = "";
    elem.style[horizontalSide] = horizontalOffset;
    elem.style[verticalSide]   = verticalOffset;
};

/************************************************************/

var getElementPosX = function(elementID)
{
    var elem = document.getElementById(elementID);
    
    if (!elem)
    {
        console.error("Cannot find element with ID \"" + elementID + "\".");
        return;
    }
    
    return elem.offsetLeft;
};

/************************************************************/

var getElementPosY = function(elementID)
{
    var elem = document.getElementById(elementID);
    
    if (!elem)
    {
        console.error("Cannot find element with ID \"" + elementID + "\".");
        return;
    }
    
    return elem.offsetTop;
};


/************************************************************/

var getElementWidth = function(elementID)
{
    var elem = document.getElementById(elementID);
    
    if (!elem)
    {
        console.error("Cannot find element with ID \"" + elementID + "\".");
        return;
    }
    
    return elem.offsetWidth;
};

/************************************************************/

var getElementHeight = function(elementID)
{
    var elem = document.getElementById(elementID);
    
    if (!elem)
    {
        console.error("Cannot find element with ID \"" + elementID + "\".");
        return;
    }
    
    return elem.offsetHeight;
};

/************************************************************/

var getViewerWidth = function()
{
    return document.body.offsetWidth;
};

/************************************************************/

var getViewerHeight = function()
{
    return document.body.offsetHeight;
};

/************************************************************/

var addElementPointerDownCallback = function(elementID, callback)
{
    var elem = document.getElementById(elementID);
    
    if (!elem)
    {
        console.error("Cannot find element with ID \"" + elementID + "\".");
        return;
    }

    elem.addEventListener("pointerdown", callback);
};

/************************************************************/

var addPointerUpCallback = function(callback)
{   
    window.addEventListener("pointerup", callback);
};

/************************************************************/

var addPointerMoveCallback = function(callback)
{   
    window.addEventListener("pointermove", callback);
};

/************************************************************/
