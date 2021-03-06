var hid = require('node-hid');
// Find Motion Controllers
var devices = hid.devices();
var hidDevices = [];
var numHIDs = 0
for (var i=0; i < devices.length; i++) {
    if ( devices[i].product == 'Motion Controller' ) {
        hidDevices[numHIDs] = devices[i].path;
        numHIDs += 1
    }
}
if ( numHIDs < 2 ) {
    console.log('Not enough motion controllers found ('+numHIDs+'). Exiting');
    process.exit();
}

var hid1 = new hid.HID(hidDevices[0]);
var hid2 = new hid.HID(hidDevices[1]);

var readingHid1 = true;
var readingHid2 = true;

var drone = require('ar-drone');
var droneControl = drone.createUdpControl();

// The 'fly' and 'emergency' reference object.
var droneRef = {};
// The command object to send to the drone.
var droneComm = {};

sendDroneCommands = false;
// Initialise drone, with reset from emergency.
droneRef.emergency = true;
droneRef.fly = false;
updateDrone();

// Remove emergency reset and start autoupdates.
setTimeout(function(){
    droneRef.emergency = false;
    updateDrone();
    sendDroneCommands = true;
},1000);

// Both 'move' buttons need to be pressed to launch the drone.
var launchStatus = [0,0];

function processHid1(data) {

    //Number1 is green.
    if (droneRef.fly == false){
       set_led(hid1,0x00,0x99,0x00)
    }else{
        //Blue if we're flying
        set_led(hid1,0x00,0x00,0x99)
    }

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
        // Exit process cleanly.
        cleanUp();
    }

    if ( triggerBin > 1 && triggerBin < 16 && droneRef.fly == false ) {
//        console.log('take off');
        launchStatus[0] = 1;
        if (launchStatus[1] == 1) {
            droneRef.fly = true;
        }
    } else {
        launchStatus[0] = 0;
        if ( triggerBin >= 16 && droneRef.fly == true ) {
//        console.log('land');
            droneRef.fly = false;
        } else if ( triggerBin == 1 ) {
            droneControl.animateLeds('blinkGreenRed',5,2);
            droneControl.flush();
        }
    }

    var rangeElevation = maxElevation - minElevation;
    var downThreshold = minElevation + rangeElevation / 3; 
    var upThreshold = maxElevation - rangeElevation / 3; 

    if (elevation > upThreshold) {
        speed = (elevation - upThreshold) / (maxElevation - upThreshold)
//        console.log('up ' + speed);
        delete droneComm.down
        droneComm.up = speed;
    } else if (elevation < downThreshold) {
        speed = (downThreshold - elevation) / (downThreshold - minElevation)
//        console.log('down ' + speed);
        delete droneComm.up
        droneComm.down = speed;
    } else {
//        console.log('stable elevation');
        delete droneComm.up;
        delete droneComm.down;
    }

    var rangeYaw = maxYaw - minYaw;
    var antiThreshold = minYaw + rangeYaw / 3; 
    var clockThreshold = maxYaw - rangeYaw / 3; 

    if (yaw > clockThreshold) {
        speed = (yaw - clockThreshold) / (maxYaw - clockThreshold)
//        console.log('anticlockwise ' + speed);
        delete droneComm.clockwise
        droneComm.counterClockwise = speed;
    } else if (yaw < antiThreshold) {
        speed = (antiThreshold - yaw) / (antiThreshold - minYaw)
//        console.log('clockwise ' + speed);
        delete droneComm.counterClockwise;
        droneComm.clockwise = speed;
    } else {
//        console.log('stable yaw');
        delete droneComm.clockwise;
        delete droneComm.counterClockwise;
    }
}

function processHid2 (data) {


    //We have to keep spamming this to keep the LED on.
    if (droneRef.fly == false){
       set_led(hid2,0x99,0x00,0x00)
    }else{
        //Blue if we're flying
        set_led(hid2,0x00,0x00,0x99)
    }

    // Start and select buttons - held together exits the app
    var startSelect = data[1];
    // Binary trigger sensors - 'PS (1)', 'Move (8)' and 'Trigger (16)'
    var triggerBin = data[3];
    // Pitch control based on z-gyro.
    var pitch = (data[16] + data[22]) / 2;
    // Roll control based on x-gyro.
    var roll = (data[14] + data[20]) / 2;

    if ( triggerBin > 1 && triggerBin < 16 && droneRef.fly == false ) {
//        console.log('take off');
        launchStatus[1] = 1;
        if (launchStatus[0] == 1) {
            droneRef.fly = true;
        }
    } else {
        launchStatus[1] = 0;
        if ( triggerBin >= 16 && droneRef.fly == true ) {
//        console.log('land');
            droneRef.fly = false;
        } else if ( triggerBin == 1 ) {
            droneControl.animateLeds('blinkGreenRed',5,2);
            droneControl.flush();
        }
    }

    // Calibration constants
    var maxPitch = 145;
    var minPitch = 111;
    var maxRoll = 145;
    var minRoll = 111;

    var rangePitch = maxPitch - minPitch;
    // Threshold for activating back rotors (drive forward)
    var backThreshold = minPitch + rangePitch / 3; 
    // Threshold for activating front rotors (drive backwards))
    var frontThreshold = maxPitch - rangePitch / 3; 

    if (pitch > frontThreshold) {
        speed = (pitch - frontThreshold) / (maxPitch - frontThreshold)
//        console.log('backwards ' + speed);
        delete droneComm.front;
        droneComm.back = speed;
    } else if (pitch < backThreshold) {
        speed = (backThreshold - pitch) / (backThreshold - minPitch)
//        console.log('forwards ' + speed);
        delete droneComm.back;
        droneComm.front = speed;
    } else {
//        console.log('stable pitch');
        delete droneComm.back;
        delete droneComm.front;
    }

    var rangeRoll = maxRoll - minRoll;
    // Threshold for activating right rotors (tilt left)
    var rightThreshold = minRoll + rangeRoll / 3;
    // Threshold for activating left rotoes (tilt right)
    var leftThreshold = maxRoll - rangeRoll / 3;

    if (roll > leftThreshold) {
        speed = (roll - leftThreshold) / (maxRoll - leftThreshold)
//        console.log('left ' + speed);
        delete droneComm.right;
        droneComm.left = speed;
    } else if (roll < rightThreshold) {
        speed = (rightThreshold - roll) / (rightThreshold - minRoll)
//        console.log('right ' + speed);
        droneComm.right = speed;
    } else {
//        console.log('stable roll');
        delete droneComm.left;
        delete droneComm.right;
    }
}

function readHid1() {
    hid1.read(function(err,dat){processHid1(dat);if(readingHid1){readHid1();}});
}

function readHid2() {
    hid2.read(function(err,dat){processHid2(dat);if(readingHid2){readHid2();}});
}

// Start reading controller 1 - subsequent reads by callback.
// Controls elevation.
if (readingHid1) {
    readHid1();
}

// Start reading controller 2 - subsequent reads by callback.
// Controls roll, yaw and pitch
if (readingHid2) {
    readHid2();
}

// Sends command packets to the drone every 30 milliseconds.
setInterval(function() {
    if ( sendDroneCommands ) {
        updateDrone();
    }
}, 30);

function updateDrone() {
    droneControl.ref(droneRef);
    droneControl.pcmd(droneComm);
    droneControl.flush();
}


function set_led(devicep, red, green, blue){
    //Set the big LED on the device.
    //for (var ri=0;ri<10000;ri++)
    //{ 
        devicep.write([0x02,0x00,red,green,blue,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]);
    //}
}

function cleanUp() {
    // Stop reading Hid controllers
    readingHid1 = false;
    readingHid2 = false;

    // Turn off lights
    set_led(hid1,0x00,0x00,0x00);
    set_led(hid1,0x00,0x00,0x00);

    // Stop sending the drone automatic commands.
    sendDroneCommands = false;

    // Land
    delete droneComm.up;
    delete droneComm.down;
    delete droneComm.front;
    delete droneComm.back;
    delete droneComm.clockwise;
    delete droneComm.counterClockwise;
    droneRef.fly = false;
    updateDrone();

    // After 5 seconds, set emergency mode, then exit.
    setTimeout(function(){
        droneRef.emergency = true;
        updateDrone();
        process.exit();
    },3000);
}
