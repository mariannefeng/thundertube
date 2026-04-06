function main() {
  // Configurables

  const websocketAddress = "ws://10.0.18.242";
  var activeTab = "input-tab";

  const defaultText =
    "function draw(previousFrame, tick){\n    var vals = Array(300).fill(200);\n\n    // create a control signal ranging from 0 to 1, based on the tick\n    var speedFactor = (2 * 3.14159) * 0.0001;\n    var controlSignal = (Math.sin(speedFactor * tick) + 1) / 2.0;\n    // scale that signal to range from 0 to 99 (because we have 100 LEDs)\n    controlSignal = Math.floor(controlSignal * 100.0);\n    // set RGB for one pixel to white, based on where the control signal is\n    vals[controlSignal * 3] = 255;\n    vals[controlSignal * 3 + 1] = 255;\n    vals[controlSignal * 3 + 2] = 255;\n    return vals;\n}";

  // Dom Elements

  var saveCodeDropdown = document.getElementById("save-code-dropdown");
  var saveCodeButton = document.getElementById("save-code-button");
  var saveCodeInput = document.getElementById("save-code-input");
  var editorElement = document.getElementById("editor");
  var messageDiv = document.getElementById("message");

  // Initializations

  const editor = CodeMirror(editorElement, {
    value: defaultText,
    mode: "javascript",
    theme: "liquibyte",
  });

  const socket = new WebSocket(websocketAddress);
  socket.binaryType = "arraybuffer";

  // Initial State

  var ledArray = [];
  var lightObjectArray = [];
  var currentCode = defaultText;
  var codeChanged = false;
  var inputRunning = true;

  var scene;
  var renderer;
  var camera;
  var allCodes = [];

  // Utils

  Object.defineProperty(Array.prototype, "chunk", {
    value: function (chunkSize) {
      var R = [];
      for (var i = 0; i < this.length; i += chunkSize)
        R.push(this.slice(i, i + chunkSize));
      return R;
    },
  });

  function toRgb([r, g, b]) {
    return new THREE.Color(r, g, b);
  }

  var prev_time = new Date().getTime();

  function start() {
    let send = function (time) {
      if (!inputRunning) {
        return requestAnimationFrame(send);
      }

      // This is throttling the amount of messages sent by websockets
      // This is because the raspberry pi network interface isn't fast enough
      // and when we were sending 60FPS, it was grouping the data and the
      // hardware didn't know how to handle this and it made it unusable
      if (Math.abs(time - prev_time) < 50) {
        return requestAnimationFrame(send);
      }
      prev_time = time;
      try {
        if (codeChanged) {
          codeChanged = false;
        }
        eval(currentCode);
        let tick = Date.now();
        let previousFrame = ledArray;
        ledArray = eval("draw(previousFrame, tick)");
        ledArray = ledArray
          .slice(0, 300)
          .map(function (num) {
            return Math.floor(num);
          })
          .map(function (num) {
            return num <= 0 ? 0 : num >= 255 ? 255 : num;
          });

        let byteArray = new Uint8Array(300);

        for (let i = 0; i < ledArray.length; i++) {
          byteArray[i] = ledArray[i];
        }

        socket.send(byteArray.buffer);
      } catch (err) {
        if (activeTab === "ai-tab") {
          aiStatus.innerHTML = '<span class="error">' + err + "</span>";
        } else {
          messageDiv.innerHTML = err;
          messageDiv.classList.add("error");
        }
      }
      requestAnimationFrame(send);
    };
    window.requestAnimationFrame(send);
  }

  // This is for the simulator
  // It's of no import for the Recurse Center Version
  function setupScene() {
    let canvas = document.getElementById("viz");
    let width = canvas.offsetWidth;
    let height = canvas.offsetHeight;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(10, width / height, 0.1, 1000);
    renderer = new THREE.WebGLRenderer();

    renderer.setSize(width, height);
    camera.position.z = 500;

    canvas.appendChild(renderer.domElement);

    scene.background = new THREE.Color(0xf0f0f0);

    let wallMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
    let wallGeometry = new THREE.PlaneBufferGeometry(500, 500);
    let wallMesh = new THREE.Mesh(wallGeometry, wallMat);
    wallMesh.receiveShadow = true;
    wallMesh.position.set(0, 0, -15);
    scene.add(wallMesh);

    let cylGeo = new THREE.CylinderBufferGeometry(7, 7, 200, 32);
    let cylMat = new THREE.MeshPhongMaterial({
      color: 0x222222,
      reflectivity: 0.2,
      shininess: 0,
    });
    var cylinder = new THREE.Mesh(cylGeo, cylMat);
    cylinder.rotateZ(Math.PI / 2);
    scene.add(cylinder);

    // Create all the initial objects
    for (let i = 0; i < 100; i++) {
      let bulb = new THREE.PointLight(0xff0000, 0.2, 30, 10);
      let bulbGeometry = new THREE.SphereBufferGeometry(1, 32, 32);
      let bulbMat = new THREE.MeshStandardMaterial({
        emissive: 0x000000,
        emissiveIntensity: 0.5,
        wireframe: true,
      });

      bulb.add(new THREE.Mesh(bulbGeometry, bulbMat));
      bulb.position.set(
        -i * 2 + 50 * 2,
        Math.sin((i * 16 * 2 * Math.PI) / 100) * 10,
        Math.cos((i * 16 * 2 * Math.PI) / 100) * 10,
      );
      bulb.castShadow = true;

      scene.add(bulb);
      lightObjectArray.push(bulb);
    }
  }

  // For The simulator
  function updateLightObject(lightObject, color) {
    lightObject.color = color;
    lightObject.children[0].material.color = color;
  }

  // For The simulator
  function animate() {
    requestAnimationFrame(animate);

    let newColors = ledArray.chunk(3).map(toRgb);
    newColors.forEach(function (color, index) {
      updateLightObject(lightObjectArray[index], color);
    });

    renderer.render(scene, camera);
  }

  function loadSavedCode() {
    return fetch("/loadallcodes", { method: "POST" })
      .then((res) => res.json())
      .then((json) => onServerLoad_(json))
      .catch((err) => {
        console.error("Error fetch codes from server:");
        console.error(err);
        onServerLoad_({});
      });
  }

  function onServerLoad_(serverJson) {
    saveCodeDropdown.innerHTML = "";
    if (!serverJson || !serverJson.savedCodes) {
      allCodes = [];
    } else {
      allCodes = JSON.parse(serverJson.savedCodes);
    }
    for (let i = 0; i < allCodes.length; i++) {
      let option = document.createElement("option");
      let code = allCodes[i];
      option.text = code.name;
      option.value = code.value;
      saveCodeDropdown.appendChild(option);
    }
  }

  function saveCode(name, codeOverride) {
    var value = codeOverride === undefined ? currentCode : codeOverride;
    let newCodes = JSON.stringify([...allCodes, { name: name, value: value }]);
    return fetch("/saveallcodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ savedCodes: newCodes }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data || data.success === false) {
          throw new Error("Save failed");
        }
        return loadSavedCode();
      });
  }

  // Event Handling

  saveCodeDropdown.addEventListener("input", function (option) {
    editor.setValue(option.target.value);
  });

  saveCodeButton.addEventListener("click", function () {
    let name = saveCodeInput.value;
    if (name.length < 4) {
      messageDiv.classList.add("error");
      messageDiv.innerHTML = "Err: give your pattern a good name";
    } else {
      saveCode(saveCodeInput.value).catch(function (err) {
        console.error("Error saving codes to server.");
        console.error(err);
        messageDiv.classList.add("error");
        messageDiv.innerHTML = "Could not save to server.";
      });
    }
  });

  editor.on("changes", function () {
    let userCode = editor.getValue();

    try {
      eval(userCode);
      currentCode = userCode;

      // reset
      codeChanged = true;
      messageDiv.innerHTML = "\n";
      messageDiv.classList.remove("error");
    } catch (err) {
      messageDiv.innerHTML = err;
      messageDiv.classList.add("error");
    }
  });

  // --- Tab Switching ---

  var tabs = document.querySelectorAll(".tab");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var targetId = tab.getAttribute("data-tab");
      tabs.forEach(function (t) {
        t.classList.remove("active");
      });
      document.querySelectorAll(".tab-content").forEach(function (c) {
        c.classList.remove("active");
      });
      tab.classList.add("active");
      document.getElementById(targetId).classList.add("active");
      activeTab = targetId;

      // When switching to input tab, resume with the editor's code
      if (targetId === "input-tab") {
        stopAiPreview();
        currentCode = editor.getValue();
        inputRunning = true;
      }
    });
  });

  // --- AI Tab ---

  var aiPromptInput = document.getElementById("ai-prompt");
  var aiGenerateBtn = document.getElementById("ai-generate-btn");
  var globalStopBtn = document.getElementById("global-stop-btn");
  var aiStatus = document.getElementById("ai-status");
  var aiCodeDiv = document.getElementById("ai-code");
  var aiSaveInput = document.getElementById("ai-save-input");
  var aiSaveButton = document.getElementById("ai-save-button");
  var aiCurrentCode = null;
  var aiCanvas = document.getElementById("ai-canvas");
  var aiCtx = aiCanvas.getContext("2d");
  var aiPreviewTimer = null;

  function drawAiPreview() {
    aiCtx.fillStyle = "#111";
    aiCtx.fillRect(0, 0, 1000, 40);
    for (var i = 0; i < 100; i++) {
      var r = ledArray[i * 3] || 0;
      var g = ledArray[i * 3 + 1] || 0;
      var b = ledArray[i * 3 + 2] || 0;
      aiCtx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
      aiCtx.beginPath();
      aiCtx.arc(i * 10 + 5, 20, 4, 0, Math.PI * 2);
      aiCtx.fill();
    }
  }

  function startAiPreview() {
    if (aiPreviewTimer) clearInterval(aiPreviewTimer);
    aiPreviewTimer = setInterval(drawAiPreview, 100);
  }

  function stopAiPreview() {
    if (aiPreviewTimer) clearInterval(aiPreviewTimer);
    aiPreviewTimer = null;
  }

  function aiGenerate() {
    var prompt = aiPromptInput.value.trim();
    if (!prompt) return;
    aiGenerateBtn.disabled = true;
    aiStatus.textContent = "Asking AI to generate...";
    aiCodeDiv.textContent = "";
    aiCurrentCode = null;

    fetch("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.error) throw new Error(data.error);

        aiCurrentCode = data.code;
        aiCodeDiv.textContent = data.code;

        // Validate by eval-ing it, then run via the existing start() loop
        try {
          eval(data.code);
          currentCode = data.code;
          inputRunning = true;
          startAiPreview();
          aiStatus.textContent = "Running! Sending to LEDs...";
        } catch (err) {
          aiStatus.innerHTML =
            '<span class="error">Generated code has errors: ' +
            err.message +
            "</span>";
        }

        aiGenerateBtn.disabled = false;
      })
      .catch(function (e) {
        aiStatus.innerHTML =
          '<span class="error">Error: ' + e.message + "</span>";
        aiGenerateBtn.disabled = false;
      });
  }

  aiSaveButton.addEventListener("click", function () {
    var name = aiSaveInput.value.trim();
    if (!aiCurrentCode) {
      aiStatus.innerHTML =
        '<span class="error">Generate code first before saving.</span>';
      return;
    }
    if (name.length < 4) {
      aiStatus.innerHTML =
        '<span class="error">Give your pattern a good name (4+ chars).</span>';
      return;
    }
    saveCode(name, aiCurrentCode)
      .then(function () {
        aiSaveInput.value = "";
        aiStatus.textContent = "Saved '" + name + "'!";
      })
      .catch(function (err) {
        console.error("Error saving codes to server.");
        console.error(err);
        aiStatus.innerHTML =
          '<span class="error">Could not save pattern to server.</span>';
      });
  });

  function globalStop() {
    // Stop both input and AI
    inputRunning = false;

    // Send a blank frame to turn off LEDs
    var blank = new Uint8Array(300);
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(blank.buffer);
    }
    ledArray = Array(300).fill(0);
    stopAiPreview();
    drawAiPreview();

    if (activeTab === "ai-tab") {
      aiStatus.textContent = "Stopped.";
    } else {
      messageDiv.innerHTML = "Stopped.";
    }
  }

  aiGenerateBtn.addEventListener("click", aiGenerate);
  globalStopBtn.addEventListener("click", globalStop);
  aiPromptInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") aiGenerate();
  });

  // Run it!

  loadSavedCode();
  start();
  // setupScene();
  // animate();
}

window.onload = main;
