
var hid = require('node-hid');
var opencv = require('opencv');

var drone = require('ar-drone');
var client = drone.createClient();

client.on('error', function(err){
  //Stop everything
  delete droneComm.down
  delete droneComm.up
  console.log('stopping')

})


//var Png = require('png').Png

var fs=require('fs')

var s = new opencv.ImageStream()
var devices = hid.devices();
var hidDevices = [];
var numHIDs = 0

for (var i=0; i < devices.length; i++) {
    if ( devices[i].product == 'Motion Controller' ) {
        hidDevices[numHIDs] = devices[i].path;
        numHIDs += 1
    }
}
if ( numHIDs < 1 ) {
    console.log('No motion controllers found. Exiting');
    process.exit();
}

var hid1 = new hid.HID(hidDevices[0]);
var droneControl = drone.createUdpControl();

// The 'fly' and 'emergency' reference object.
var droneRef = {};
// The command object to send to the drone.
var droneComm = {};

// Initialise drone, with reset from emergency.
droneRef.emergency = true;
droneRef.fly = false;

// Remove emergency reset.
setTimeout(function(){droneRef.emergency = false;},1000);

function processHid1(data) {

    // Start and select buttons - held together exits the app
    var startSelect = data[1];
    // Binary trigger sensors - 'PS (1)', 'Move (8)' and 'Trigger (16)'
    var triggerBin = data[3];
    // Elevation control based on z-gyro.
    var elevation = (data[16] + data[22]) / 2;
    // Yaw control based on x-gyro.
    var yaw = (data[14] + data[20]) / 2;

    // Calibration constants
    var maxElevation = 145;
    var minElevation = 111;
    var maxYaw = 145;
    var minYaw = 111;

    if ( startSelect == 9 ) {
        process.exit()
    }

    if ( triggerBin > 1 && triggerBin < 16 && droneRef.fly == false ) {
//        console.log('take off');
        droneRef.fly = true;
    } else if ( triggerBin >= 16 && droneRef.fly == true ) {
//        console.log('land');
        droneRef.fly = false;
    } else if ( triggerBin == 1 ) {
        droneControl.animateLeds('blinkGreenRed',5,2);
        droneControl.flush();
    }

}

function readHid1() {
    hid1.read(function(err,dat){processHid1(dat);readHid1();});
}

readHid1();

// Sends command packets to the drone every 30 milliseconds.
setInterval(function() {
    droneControl.ref(droneRef);
    droneControl.pcmd(droneComm);
    droneControl.flush();
}, 30);











function handleImage(mat){
    im = mat 
    //var tmp = new png(im, 640,320)
    //console.log(tmp)
    // (B)lue, (G)reen, (R)ed
    var lower_threshold = [0, 160, 0];
    var upper_threshold = [255, 255, 255];
    set_led(hid1, 0x00,0x33,0x00);

    orig = im.copy();
    im.inRange(lower_threshold, upper_threshold);
    var maxArea = 1000;
  var WHITE = [255, 255, 255]; //B, G, R
    var GREEN = [0, 255, 0]; //B, G, R
    var RED = [0, 0, 255]; //B, G, R

    contours = im.findContours();

    for(i = 0; i < contours.size(); i++) {
        if(contours.area(i) > maxArea) {
            console.log(contours)
            console.log(im.size())
            orig.drawContour(contours, i, RED);
            var sumX = 0; 
            var sumY = 0;

            for(var j = 0; j < contours.cornerCount(i); ++j) {
                var point = contours.point(i, j);
                //console.log(point.x,point.y)
                sumX += point.x
                sumY += point.y
            }
            centroidx = sumX/contours.cornerCount(i)// - im.size()[1]/2
            centroidy = sumY/contours.cornerCount(i)//- im.size()[0]/2
            var imwidth = im.size()[1]
            var imheight = im.size()[0]
            console.log(centroidx,centroidy)
            if (centroidx  < imwidth / 3){
                console.log('Fly left')

            } else if (centroidx > 2 * imwidth / 3){

                console.log('Fly right')
            }

            if (centroidy  < imheight / 3){
                console.log('Fly up')
                delete droneComm.down
                droneComm.up = 0.4;

            } else if (centroidy > 2 * imheight / 3){
                delete droneComm.up
                droneComm.down = 0.4;
                console.log('Fly down')
            } else {
                delete droneComm.down
                delete droneComm.up


            }


        }
    }

    var sumX = 0; 
    var sumY = 0;
    shape = orig.size();


    im.save('./out.jpg');
    orig.save('./origout.jpg');
}








function set_led(devicep, red, green, blue){
    //for (var ri=0;ri<10000;ri++)
    //{ 
        devicep.write([0x02,0x00,red,green,blue,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]);
    //}
}

var counter = 0

function wrapper(buffer){
    console.log('b')

    opencv.readImage(buffer, function(err,im){
        handleImage(im)
    })
    
    // opencv.readImage(buffer,function(mat){
    //     console.log(mat)

    // })
    // //console.log(buffer)
    //var png = new Png(buffer, 640,360,'rgba');
    //console.log(buffer.length())
    //console.log(png)
    //var png_image = png.encodeSync();
    //console.log(png_image)
}

//drone.createPngStream().pipe(s);


var pngStream = client.getPngStream()



//console.log(out)


pngStream
  .on('data', wrapper)

console.log(client._events)
console.log(pngStream._events)

