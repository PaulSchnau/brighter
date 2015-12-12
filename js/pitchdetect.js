window.AudioContext = window.AudioContext || window.webkitAudioContext;

var audioContext = null;
var isPlaying = false;
var sourceNode = null;
var analyser = null;
var theBuffer = null;
var DEBUGCANVAS = null;
var mediaStreamSource = null;
var detectorElem,
	canvasElem,
	waveCanvas,
	pitchElem,
	noteElem,
	detuneElem,
	detuneAmount;


last_known_pitch = -1;

window.onload = function() {
	audioContext = new AudioContext();
	MAX_SIZE = Math.max(4,Math.floor(audioContext.sampleRate/5000));	// corresponds to a 5kHz signal
	var request = new XMLHttpRequest();
	request.open("GET", "../retribution.ogg", true);
	request.responseType = "arraybuffer";
	request.onload = function() {
	  audioContext.decodeAudioData( request.response, function(buffer) {
	    	theBuffer = buffer;
		} );
	}
	request.send();

	// detectorElem = document.getElementById( "detector" );
	// canvasElem = document.getElementById( "output" );
	// DEBUGCANVAS = document.getElementById( "waveform" );
	// if (DEBUGCANVAS) {
	// 	waveCanvas = DEBUGCANVAS.getContext("2d");
	// 	waveCanvas.strokeStyle = "black";
	// 	waveCanvas.lineWidth = 1;
	// }
	// pitchElem = document.getElementById( "pitch" );
	// noteElem = document.getElementById( "note" );
	// detuneElem = document.getElementById( "detune" );
	// detuneAmount = document.getElementById( "detune_amt" );
	//
	// detectorElem.ondragenter = function () {
	// 	this.classList.add("droptarget");
	// 	return false; };
	// detectorElem.ondragleave = function () { this.classList.remove("droptarget"); return false; };
	// detectorElem.ondrop = function (e) {
  // 		this.classList.remove("droptarget");
  // 		e.preventDefault();
	// 	theBuffer = null;
	//
	//   	var reader = new FileReader();
	//   	reader.onload = function (event) {
	//   		audioContext.decodeAudioData( event.target.result, function(buffer) {
	//     		theBuffer = buffer;
	//   		}, function(){alert("error loading!");} );
	//
	//   	};
	//   	reader.onerror = function (event) {
	//   		alert("Error: " + reader.error );
	// 	};
	//   	reader.readAsArrayBuffer(e.dataTransfer.files[0]);
	//   	return false;
	// };
}

function error() {
    alert('Stream generation failed.');
}

function getUserMedia(dictionary, callback) {
    try {
        navigator.getUserMedia =
        	navigator.getUserMedia ||
        	navigator.webkitGetUserMedia ||
        	navigator.mozGetUserMedia;
        navigator.getUserMedia(dictionary, callback, error);
    } catch (e) {
        alert('getUserMedia threw exception :' + e);
    }
}

function gotStream(stream) {
    // Create an AudioNode from the stream.
    mediaStreamSource = audioContext.createMediaStreamSource(stream);

    // Connect it to the destination.
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    mediaStreamSource.connect( analyser );
    updatePitch();
}

function toggleLiveInput() {
    if (isPlaying) {
        //stop playing and return
        sourceNode.stop( 0 );
        sourceNode = null;
        analyser = null;
        isPlaying = false;
		if (!window.cancelAnimationFrame)
			window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame( rafID );
    }
    getUserMedia(
    	{
            "audio": {
                "mandatory": {
                    "googEchoCancellation": "false",
                    "googAutoGainControl": "false",
                    "googNoiseSuppression": "false",
                    "googHighpassFilter": "false"
                },
                "optional": []
            },
        }, gotStream);
}

function togglePlayback() {
    if (isPlaying) {
        //stop playing and return
        sourceNode.stop( 0 );
        sourceNode = null;
        analyser = null;
        isPlaying = false;
		if (!window.cancelAnimationFrame)
			window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame( rafID );
        return "start";
    }

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = theBuffer;
    sourceNode.loop = true;

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    sourceNode.connect( analyser );
    analyser.connect( audioContext.destination );
    sourceNode.start( 0 );
    isPlaying = true;
    isLiveInput = false;
    updatePitch();

    return "stop";
}

var rafID = null;
var tracks = null;
var buflen = 1024;
var buf = new Float32Array( buflen );

var noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
var noteColors = ["#ff0000", "#ff7f00", "#ffff00", "#7fff00", "#00ff00", "#00ff7f", "#00ffff", "#007fff", "#0000ff", "#7f00ff", "#ff00ff", "#ff007f"];

nextColorIndex = 0;
function getNextColor(){
	nextColorIndex += 1;
	return noteColors[nextColorIndex%12];
}

function getHue(logPitch){
	console.log(logPitch);
	var absolute_hue = logPitch * 360 / 512;
	var relative_hue = (absolute_hue + 210) % 360;
	return relative_hue;
}

highAmplitudeReached = 0;
function getSaturation(buffer){
	var currentMaxAmplitude = Math.max(...buf);
	if (currentMaxAmplitude > highAmplitudeReached){
		highAmplitudeReached = currentMaxAmplitude;
	} else {
		highAmplitudeReached = highAmplitudeReached * 0.99;
	}
	var relativeAmplitude = currentMaxAmplitude / highAmplitudeReached;
	return ((relativeAmplitude * 100) / 2 ) + 25;
}

highAmplitudeReached2 = 0;
function getLightness(buffer){
	var currentMaxAmplitude = Math.max(...buf);
	if (currentMaxAmplitude > highAmplitudeReached2){
		highAmplitudeReached2 = currentMaxAmplitude;
	} else {
		highAmplitudeReached2 = highAmplitudeReached2 * 0.999;
	}
	var relativeAmplitude = currentMaxAmplitude / highAmplitudeReached2;
	return ((relativeAmplitude * 100) / 2 ) + 0;
}

var MIN_SAMPLES = 4;  // will be initialized when AudioContext is created.
var pitches = [];

function getFFT( buf, sampleRate ) {

	// get spectrum
	var SIZE = buf.length;
	var dft = new DFT(SIZE, 44100);
	dft.forward(buf);
    var spectrum = dft.spectrum;
    var spec_len = spectrum.length

	// differentiate spectrum
	var diff = []
	for (var i = 0; i < spec_len; i++)
	{
		diff[i] = spectrum[i + 1] - spectrum[i]
	}

	// find peaks in spectrum - i.e. where gradient is positive then negative
	var peak_ind_val = []
	for (var i = 0; i < diff.length; i++)
	{
		if (diff[i] > 0 && diff[i + 1] <= 0)
		{
			var ind_val = [i, spectrum[i]]
			peak_ind_val.push(ind_val)
		}
	}
	peak_ind_val.sort(function(a,b){
    	return b[1] - a[1];
	});
	if (peak_ind_val.length < 3)
	{
		peak_ind_val = [[0, 0], [0, 0], [0, 0]];
	}
	top3 = peak_ind_val.slice(0, 3);
	return top3;
}


function autoCorrelate( buf, sampleRate ) {

	var SIZE = buf.length;
	var MAX_SAMPLES = Math.floor(SIZE/2);
	var best_offset = -1;
	var best_correlation = 0;
	var rms = 0;
	var foundGoodCorrelation = false;
	var correlations = new Array(MAX_SAMPLES);

	var lastCorrelation=1;
	for (var offset = MIN_SAMPLES; offset < MAX_SAMPLES; offset++) {
		var correlation = 0;

		for (var i=0; i<MAX_SAMPLES; i++) {
			correlation += Math.abs((buf[i])-(buf[i+offset]));
		}
		correlation = 1 - (correlation/MAX_SAMPLES);
		correlations[offset] = correlation;
		if ((correlation>0.9) && (correlation > lastCorrelation)) {
			foundGoodCorrelation = true;
			if (correlation > best_correlation) {
				best_correlation = correlation;
				best_offset = offset;
			}
		} else if (foundGoodCorrelation) {
			var shift = (correlations[best_offset+1] - correlations[best_offset-1])/correlations[best_offset];
			last_known_pitch = sampleRate/(best_offset+(8*shift));
			return last_known_pitch;
		}
		lastCorrelation = correlation;
	}
	if (best_correlation > 0.01) {
		last_known_pitch = sampleRate/best_offset;
	}
	return last_known_pitch;
}

lastTimeColorChanged = Date.now();
threshold = 0.1;
function shouldColorChange( buf , timeLastColorChanged){
	if (Date.now() - lastTimeColorChanged > 85){
		lastTimeColorChanged = Date.now();
		return true;
	}
	return false;

	// if (Date.now() - lastTimeColorChanged < 50){
	// 	return false;
	// }
	// threshold = threshold * 0.99;
	// maxAmplitude = Math.max(...buf);

	// if (maxAmplitude > threshold){
	// 	threshold = maxAmplitude * 2;
	// 	lastTimeColorChanged = Date.now();
	// 	return true;
	// }
	// return false;
}

colors = [];
function updatePitch( time ) {
	var cycles = new Array;
	analyser.getFloatTimeDomainData( buf );
	var ac = getFFT(buf, audioContext.sampleRate );

	if (DEBUGCANVAS) {  // This draws the current waveform, useful for debugging
		waveCanvas.clearRect(0,0,512,256);
		waveCanvas.strokeStyle = "red";
		waveCanvas.beginPath();
		waveCanvas.moveTo(0,0);
		waveCanvas.lineTo(0,256);
		waveCanvas.moveTo(128,0);
		waveCanvas.lineTo(128,256);
		waveCanvas.moveTo(256,0);
		waveCanvas.lineTo(256,256);
		waveCanvas.moveTo(384,0);
		waveCanvas.lineTo(384,256);
		waveCanvas.moveTo(512,0);
		waveCanvas.lineTo(512,256);
		waveCanvas.stroke();
		waveCanvas.strokeStyle = "black";
		waveCanvas.beginPath();
		waveCanvas.moveTo(0,buf[0]);
		for (var i=1;i<512;i++) {
			waveCanvas.lineTo(i,128+(buf[i]*128));
		}
		waveCanvas.stroke();
	}

 	colorChange = shouldColorChange(buf, audioContext.sampleRate);
 	if (colorChange){
		if (ac) {
			var colors = [];
			for (var i = 0; i < 3; i++) {
				var hue = getHue(ac[i][0]);
				var saturation = getSaturation(buf);
				var lightness = getLightness(buf);
				var color = 'hsl(' + hue + ', ' + saturation + '%, ' + lightness + '%)';
				colors.push(color);
			}
			var gradient = 'linear-gradient(to bottom right, ' + colors[0] + ', ' + colors[1] + ', ' + colors[2] + ')';
	 		document.body.style.backgroundImage = gradient;
			myFirebaseRef.set({gradient: gradient});
		}
 	}

	if (!window.requestAnimationFrame)
		window.requestAnimationFrame = window.webkitRequestAnimationFrame;
	rafID = window.requestAnimationFrame( updatePitch );
}

var myFirebaseRef = new Firebase("https://brighter.firebaseio.com/");

function followerMode(){
	myFirebaseRef.child("backgroundImage").on("value", function(snapshot) {
		document.body.style.backgroundImage = snapshot.val();
	});
}
