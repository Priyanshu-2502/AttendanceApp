const video = document.getElementById('video');
const counterDisplay = document.getElementById('counter');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const statusDisplay = document.getElementById('status');
const lastCountDisplay = document.getElementById('lastCount');
const clearBtn = document.getElementById('clearBtn');
const autoBtn = document.getElementById('autoBtn');
const overlay = document.getElementById('overlay');
const videoWrap = document.getElementById('videoWrap');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const flipBtn = document.getElementById('flipBtn');

// Create popup animation element with enhanced styling
const popup = document.createElement('div');
popup.style.position = 'fixed';
popup.style.top = '20%';
popup.style.left = '50%';
popup.style.transform = 'translate(-50%, -50%) scale(0.8)';
popup.style.background = 'linear-gradient(to right, #10b981, #06b6d4)';
popup.style.color = 'white';
popup.style.padding = '15px 25px';
popup.style.borderRadius = '16px';
popup.style.fontWeight = 'bold';
popup.style.display = 'none';
popup.style.boxShadow = '0 10px 25px rgba(16, 185, 129, 0.4)';
popup.style.zIndex = '1000';
popup.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
popup.textContent = '✅ Face Detected!';
document.body.appendChild(popup);

let totalFaces = 0;
let lastCount = 0;
let scanning = false;
let autoMode = false;
let detectionTimeout;
let scanCooldown = false;
let isFullscreen = false;
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let currentStream = null;
let videoInputDevices = [];
let currentDeviceIndex = 0;
let currentFacingMode = 'user';

// Set up canvas for drawing face detection box
const canvas = overlay;

// Check and handle orientation changes
function checkOrientation() {
  if (window.matchMedia("(orientation: portrait)").matches) {
    console.log("Portrait orientation");
  } else {
    console.log("Landscape orientation");
  }
  resizeCanvas();
}

// Handle orientation change
function handleOrientationChange() {
  setTimeout(resizeCanvas, 300); // Delay to allow UI to update
}

// Resize canvas to match video dimensions
function resizeCanvas() {
  if (video.videoWidth && video.videoHeight) {
    // Get the current dimensions of the video element as displayed
    const videoRect = video.getBoundingClientRect();
    
    // Set canvas dimensions to match the displayed video size
    canvas.width = videoRect.width;
    canvas.height = videoRect.height;
    
    // Set canvas position to overlay the video exactly
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    
    console.log('Canvas resized to match displayed video: ', canvas.width, 'x', canvas.height);
    console.log('Video element size: ', videoRect.width, 'x', videoRect.height);
    
    // Redraw any active detections
    if (scanning) {
      detectFace();
    }
  }
}

// Toggle fullscreen mode
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    videoWrap.requestFullscreen().catch(err => {
      console.error(`Error attempting to enable fullscreen: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
}

// Update fullscreen button icon
function updateFullscreenButton() {
  if (document.fullscreenElement) {
    fullscreenBtn.innerHTML = "⤓";
    isFullscreen = true;
  } else {
    fullscreenBtn.innerHTML = "⛶";
    isFullscreen = false;
  }
}

// Load models - using CDN path as fallback if local models fail
async function loadModels() {
  try {
    // First try to load from local models folder
    await faceapi.nets.tinyFaceDetector.loadFromUri('models');
    console.log('✅ Models loaded successfully from local folder');
    statusDisplay.textContent = 'Ready';
    statusDisplay.style.color = '#10b981';
  } catch (error) {
    console.error('❌ Local model load error, trying CDN:', error);
    try {
      // Fallback to CDN
      await faceapi.nets.tinyFaceDetector.loadFromUri('https://justadudewhohacks.github.io/face-api.js/models');
      console.log('✅ Models loaded successfully from CDN');
      statusDisplay.textContent = 'Ready (using CDN models)';
      statusDisplay.style.color = '#10b981';
    } catch (cdnError) {
      console.error('❌ CDN model load error:', cdnError);
      statusDisplay.textContent = 'Error loading models';
      statusDisplay.style.color = '#ef4444';
    }
  }
}

// Start webcam
async function startVideo(options = {}) {
  try {
    // Optimize video constraints based on device
    let videoConstraints;
    if (options.deviceId) {
      videoConstraints = {
        deviceId: { exact: options.deviceId },
        width: { ideal: isMobile ? 640 : 640 },
        height: { ideal: isMobile ? 480 : 480 }
      };
    } else if (options.facingMode) {
      videoConstraints = {
        facingMode: options.facingMode,
        width: { ideal: isMobile ? 640 : 640 },
        height: { ideal: isMobile ? 480 : 480 }
      };
    } else {
      videoConstraints = isMobile ? {
        facingMode: currentFacingMode,
        width: { ideal: 640 },
        height: { ideal: 480 }
      } : {
        width: { ideal: 640 },
        height: { ideal: 480 }
      };
    }

    const constraints = { video: videoConstraints, audio: false };
    
    // Stop any existing stream
    if (currentStream) {
      currentStream.getTracks().forEach(t => t.stop());
    }
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = currentStream;
    
    // Set canvas size to match video
    video.addEventListener('loadedmetadata', () => {
      resizeCanvas();
    });
    
    // Ensure video is playing
    video.addEventListener('loadeddata', () => {
      console.log('Video loaded and ready');
      statusDisplay.textContent = 'Camera ready';
      videoWrap.classList.add('pulse');
      setTimeout(() => videoWrap.classList.remove('pulse'), 2000);
    });
    
    // Start playing the video
    video.play().catch(e => {
      console.error('Error playing video:', e);
      
      // Special handling for iOS Safari
      if (isMobile && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
        statusDisplay.textContent = 'Tap "Scan" to activate camera';
        statusDisplay.style.color = '#f59e0b';
      }
    });
    
  } catch (error) {
    console.error('❌ Camera access denied:', error);
    statusDisplay.textContent = 'Camera access denied';
    statusDisplay.style.color = '#ef4444';
  }
}

// Enumerate available cameras
async function loadCameras() {
  try {
    // iOS Safari requires permission before labels become available
    if (!currentStream) {
      await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    videoInputDevices = devices.filter(d => d.kind === 'videoinput');
    console.log('Available cameras:', videoInputDevices.map(d => ({ label: d.label, deviceId: d.deviceId })));
  } catch (e) {
    console.warn('Could not enumerate devices:', e);
  }
}

// Flip between cameras
async function flipCamera() {
  try {
    await loadCameras();
    if (videoInputDevices.length > 1) {
      // Cycle through device list
      currentDeviceIndex = (currentDeviceIndex + 1) % videoInputDevices.length;
      const nextDeviceId = videoInputDevices[currentDeviceIndex].deviceId;
      console.log('Switching to device:', videoInputDevices[currentDeviceIndex].label || nextDeviceId);
      statusDisplay.textContent = 'Switching camera...';
      statusDisplay.style.color = '#60a5fa';
      await startVideo({ deviceId: nextDeviceId });
    } else {
      // Fallback: toggle facingMode
      currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
      console.log('Toggling facingMode to:', currentFacingMode);
      statusDisplay.textContent = 'Switching camera...';
      statusDisplay.style.color = '#60a5fa';
      await startVideo({ facingMode: currentFacingMode });
    }
    // Clear overlay and resize canvas after switching
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    resizeCanvas();
    statusDisplay.textContent = currentFacingMode === 'environment' ? 'Back camera active' : 'Front camera active';
    statusDisplay.style.color = '#10b981';
  } catch (err) {
    console.error('Error flipping camera:', err);
    statusDisplay.textContent = 'Error switching camera';
    statusDisplay.style.color = '#ef4444';
  }
}

// Show popup animation
function showPopup() {
  // Adjust popup position for mobile
  if (isMobile) {
    popup.style.top = isFullscreen ? '30%' : '20%';
    popup.style.padding = '10px 20px';
  }
  
  popup.style.display = 'block';
  popup.style.opacity = '1';
  popup.style.transform = 'translate(-50%, -50%) scale(1)';
  popup.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

  setTimeout(() => {
    popup.style.opacity = '0';
    popup.style.transform = 'translate(-50%, -50%) scale(0.8)';
    setTimeout(() => (popup.style.display = 'none'), 500);
  }, 1500);
}

// Draw face detection box
function drawDetection(detection) {
  // Clear previous drawings
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (detection) {
    // Calculate scale factors between detection coordinates and canvas
    const scaleX = canvas.width / video.videoWidth;
    const scaleY = canvas.height / video.videoHeight;
    
    // Scale detection box
    const scaledBox = {
      x: detection.box.x * scaleX,
      y: detection.box.y * scaleY,
      width: detection.box.width * scaleX,
      height: detection.box.height * scaleY
    };
    
    // Draw box around face with animation
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(16, 185, 129, 0.7)';
    
    // Draw the detection box
    ctx.beginPath();
    ctx.rect(
      scaledBox.x, 
      scaledBox.y, 
      scaledBox.width, 
      scaledBox.height
    );
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Draw "OK" text
    ctx.font = 'bold 16px Poppins, sans-serif';
    ctx.fillStyle = '#10b981';
    ctx.fillText('OK', scaledBox.x, scaledBox.y - 10);
    
    console.log('Face detected at:', scaledBox);
  }
}

// Detect face
async function detectFace() {
  if (!scanning) return;
  
  statusDisplay.textContent = 'Scanning...';
  console.log('Scanning for faces...');
  
  try {
    // Make sure video is ready
    if (video.readyState !== 4) {
      console.log('Video not ready yet, waiting...');
      requestAnimationFrame(detectFace);
      return;
    }
    
    // Detect face with optimized settings for mobile
    const detection = await faceapi.detectSingleFace(
      video,
      new faceapi.TinyFaceDetectorOptions({ 
        scoreThreshold: 0.5,
        inputSize: isMobile ? 224 : 320 // Smaller input size for mobile
      })
    );

    console.log('Detection result:', detection);
    
    if (detection) {
      // Only count if exactly one face is detected
      totalFaces++;
      lastCount = 1;
      
      // Animate counter
      animateCounter(totalFaces);
      lastCountDisplay.textContent = lastCount;
      
      // Draw detection box
      drawDetection(detection);
      
      // Show success popup
      showPopup();
      
      statusDisplay.textContent = 'Face detected!';
      statusDisplay.style.color = '#10b981';
      
      // Stop scanning for a few seconds to prevent multiple counts
      scanning = false;
      clearTimeout(detectionTimeout);
      detectionTimeout = setTimeout(() => {
        if (autoMode) {
          scanning = true;
          detectFace();
        }
      }, isMobile ? 2000 : 2500); // Shorter cooldown on mobile
    } else {
      // No face detected
      lastCount = 0;
      lastCountDisplay.textContent = lastCount;
      statusDisplay.textContent = 'No face detected';
      statusDisplay.style.color = '#ef4444';
      
      // Clear canvas
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (autoMode) {
        // Continue scanning in auto mode
        requestAnimationFrame(detectFace);
      } else {
        scanning = false;
      }
    }
  } catch (error) {
    console.error('Detection error:', error);
    statusDisplay.textContent = 'Detection error';
    statusDisplay.style.color = '#ef4444';
    scanning = false;
  }
}

// Animate counter with counting effect
function animateCounter(targetValue) {
  // Simplified animation for mobile
  if (isMobile) {
    counterDisplay.textContent = targetValue;
    counterDisplay.style.textShadow = '0 0 20px rgba(16, 185, 129, 0.6)';
    setTimeout(() => {
      counterDisplay.style.textShadow = '0 0 20px rgba(16, 185, 129, 0.2)';
    }, 1000);
    return;
  }
  
  // Full animation for desktop
  const startValue = parseInt(counterDisplay.textContent) || 0;
  const duration = 1000;
  const startTime = performance.now();
  
  function updateCounter(currentTime) {
    const elapsedTime = currentTime - startTime;
    const progress = Math.min(elapsedTime / duration, 1);
    
    // Easing function for smooth animation
    const easeOutQuad = progress * (2 - progress);
    
    // Calculate current value
    const currentValue = Math.floor(startValue + (targetValue - startValue) * easeOutQuad);
    
    // Update display
    counterDisplay.textContent = currentValue;
    
    // Add highlight effect
    counterDisplay.style.textShadow = `0 0 ${20 + 10 * (1 - progress)}px rgba(16, 185, 129, ${0.2 + 0.4 * (1 - progress)})`;
    
    // Continue animation if not complete
    if (progress < 1) {
      requestAnimationFrame(updateCounter);
    }
  }
  
  requestAnimationFrame(updateCounter);
}

// Add touch feedback for mobile devices
function addTouchFeedback() {
  const buttons = document.querySelectorAll('button');
  
  buttons.forEach(button => {
    button.addEventListener('touchstart', () => {
      button.style.transform = 'scale(0.95)';
    });
    
    button.addEventListener('touchend', () => {
      button.style.transform = 'scale(1)';
    });
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM loaded, initializing app...');
  console.log('Mobile device detected:', isMobile);
  
  // Add event listeners for fullscreen
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  
  // Add event listeners for orientation changes
  window.addEventListener('orientationchange', handleOrientationChange);
  window.addEventListener('resize', resizeCanvas);
  
  // Add touch feedback for mobile
  if (isMobile) {
    addTouchFeedback();
  }
  
  // Initialize app
  statusDisplay.textContent = 'Loading models...';
  statusDisplay.style.color = '#60a5fa';
  
  await loadModels();
  
  statusDisplay.textContent = 'Starting camera...';
  statusDisplay.style.color = '#f59e0b';
  
  await startVideo();
  await loadCameras();
  
  // Initial orientation check
  checkOrientation();
});

// Button event listeners
startBtn.addEventListener('click', () => {
  console.log('Scan button clicked');
  scanning = true;
  
  // Add button press animation
  startBtn.style.transform = 'scale(0.95)';
  setTimeout(() => {
    startBtn.style.transform = 'scale(1)';
  }, 200);
  
  // Add video container highlight
  videoWrap.style.boxShadow = '0 0 0 1px #334155, 0 0 30px rgba(79, 70, 229, 0.4)';
  setTimeout(() => {
    videoWrap.style.boxShadow = '0 0 0 1px #334155, 0 0 30px rgba(79, 70, 229, 0.2)';
  }, 500);
  
  detectFace();
});

resetBtn.addEventListener('click', () => {
  console.log('Reset button clicked');
  totalFaces = 0;
  counterDisplay.textContent = '0';
  statusDisplay.textContent = 'Counter reset';
  statusDisplay.style.color = '#f59e0b';
  
  // Add button press animation
  resetBtn.style.transform = 'scale(0.95)';
  setTimeout(() => {
    resetBtn.style.transform = 'scale(1)';
  }, 200);
  
  // Reset counter display style
  counterDisplay.style.textShadow = '0 0 20px rgba(16, 185, 129, 0.2)';
});

clearBtn.addEventListener('click', () => {
  console.log('Clear button clicked');
  const ctx = canvas.getContext('2d');
  
  // Fade out effect for clearing
  const fadeOutEffect = () => {
    ctx.globalAlpha -= 0.1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (ctx.globalAlpha > 0) {
      requestAnimationFrame(fadeOutEffect);
    } else {
      ctx.globalAlpha = 1;
    }
  };
  
  if (!isMobile) {
    ctx.globalAlpha = 1;
    fadeOutEffect();
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  
  lastCount = 0;
  lastCountDisplay.textContent = '0';
  statusDisplay.textContent = 'Display cleared';
  statusDisplay.style.color = '#60a5fa';
  
  // Add button press animation
  clearBtn.style.transform = 'scale(0.95)';
  setTimeout(() => {
    clearBtn.style.transform = 'scale(1)';
  }, 200);
});

autoBtn.addEventListener('click', () => {
  console.log('Auto button clicked');
  autoMode = !autoMode;
  autoBtn.textContent = autoMode ? 'Auto: On' : 'Auto: Off';
  
  // Add button press animation
  autoBtn.style.transform = 'scale(0.95)';
  setTimeout(() => {
    autoBtn.style.transform = 'scale(1)';
  }, 200);
  
  if (autoMode) {
    scanning = true;
    detectFace();
    statusDisplay.textContent = 'Auto mode enabled';
    statusDisplay.style.color = '#8b5cf6';
  } else {
    scanning = false;
    statusDisplay.textContent = 'Auto mode disabled';
    statusDisplay.style.color = '#60a5fa';
  }
});

// Flip camera button
flipBtn.addEventListener('click', async () => {
  flipBtn.style.transform = 'scale(0.95)';
  setTimeout(() => { flipBtn.style.transform = 'scale(1)'; }, 200);
  await flipCamera();
});
