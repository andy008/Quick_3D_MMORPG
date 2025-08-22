import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.124/build/three.module.js';

import {entity} from "./entity.js";

export const webxr_component = (() => {

  class WebXRController extends entity.Component {
    constructor(params) {
      super();
      this._params = params;
      this._vrControllers = [];
      this._controllerModels = [];
      this._isVRActive = false;
    }

    InitComponent() {
      this._setupWebXR();
    }

    _setupWebXR() {
      const renderer = this._params.renderer;
      const scene = this._params.scene;
      
      if (!renderer || !renderer.xr) {
        console.warn('WebXR not available on this renderer');
        return;
      }

      // Create controller visualizations
      for (let i = 0; i < 2; i++) {
        this._setupController(i, renderer, scene);
      }

      // Listen for VR session events
      renderer.xr.addEventListener('sessionstart', () => {
        this._isVRActive = true;
        this._onVRSessionStart();
      });

      renderer.xr.addEventListener('sessionend', () => {
        this._isVRActive = false;
        this._onVRSessionEnd();
      });
    }

    _setupController(index, renderer, scene) {
      // Get the controller
      const controller = renderer.xr.getController(index);
      
      // Add controller event listeners
      controller.addEventListener('selectstart', (event) => this._onSelectStart(event, index));
      controller.addEventListener('selectend', (event) => this._onSelectEnd(event, index));
      controller.addEventListener('connected', (event) => this._onControllerConnected(event, index));
      controller.addEventListener('disconnected', (event) => this._onControllerDisconnected(event, index));
      
      scene.add(controller);

      // Create a simple controller visualization (line pointing forward)
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1)
      ]);
      const material = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
      const line = new THREE.Line(geometry, material);
      controller.add(line);

      // Get the controller grip
      const controllerGrip = renderer.xr.getControllerGrip(index);
      scene.add(controllerGrip);

      // Store controller data
      this._vrControllers[index] = {
        controller: controller,
        grip: controllerGrip,
        line: line,
        isSelecting: false,
        gamepad: null
      };
    }

    _onSelectStart(event, controllerIndex) {
      const controllerData = this._vrControllers[controllerIndex];
      if (controllerData) {
        controllerData.isSelecting = true;
        controllerData.line.material.color.setHex(0xff0000); // Change to red when selecting
        
        // Broadcast VR interaction event
        this.Broadcast({
          topic: 'vr.controller.select',
          controllerIndex: controllerIndex,
          controller: controllerData.controller,
          selecting: true
        });
      }
    }

    _onSelectEnd(event, controllerIndex) {
      const controllerData = this._vrControllers[controllerIndex];
      if (controllerData) {
        controllerData.isSelecting = false;
        controllerData.line.material.color.setHex(0x00ff00); // Change back to green
        
        this.Broadcast({
          topic: 'vr.controller.select',
          controllerIndex: controllerIndex,
          controller: controllerData.controller,
          selecting: false
        });
      }
    }

    _onControllerConnected(event, controllerIndex) {
      console.log(`VR Controller ${controllerIndex} connected:`, event.data);
      
      const controllerData = this._vrControllers[controllerIndex];
      if (controllerData) {
        controllerData.gamepad = event.data.gamepad;
        
        this.Broadcast({
          topic: 'vr.controller.connected',
          controllerIndex: controllerIndex,
          gamepad: event.data.gamepad
        });
      }
    }

    _onControllerDisconnected(event, controllerIndex) {
      console.log(`VR Controller ${controllerIndex} disconnected`);
      
      this.Broadcast({
        topic: 'vr.controller.disconnected',
        controllerIndex: controllerIndex
      });
    }

    _onVRSessionStart() {
      console.log('VR Session started');
      
      // Hide desktop UI elements that don't make sense in VR
      const desktopUI = document.getElementById('game-ui');
      if (desktopUI) {
        desktopUI.style.display = 'none';
      }

      // Disable third person camera in VR mode
      const thirdPersonCamera = this.FindEntity('player')?.GetComponent('ThirdPersonCamera');
      if (thirdPersonCamera) {
        thirdPersonCamera._vrModeActive = true;
      }

      this.Broadcast({
        topic: 'vr.session.start'
      });
    }

    _onVRSessionEnd() {
      console.log('VR Session ended');
      
      // Show desktop UI elements again
      const desktopUI = document.getElementById('game-ui');
      if (desktopUI) {
        desktopUI.style.display = 'block';
      }

      // Re-enable third person camera
      const thirdPersonCamera = this.FindEntity('player')?.GetComponent('ThirdPersonCamera');
      if (thirdPersonCamera) {
        thirdPersonCamera._vrModeActive = false;
      }

      this.Broadcast({
        topic: 'vr.session.end'
      });
    }

    Update(timeElapsed) {
      if (!this._isVRActive) return;

      // Update controller states and handle continuous input
      for (let i = 0; i < this._vrControllers.length; i++) {
        const controllerData = this._vrControllers[i];
        if (controllerData && controllerData.gamepad) {
          this._updateControllerInput(i, controllerData);
        }
      }
    }

    _updateControllerInput(controllerIndex, controllerData) {
      const gamepad = controllerData.gamepad;
      
      // Handle thumbstick input for movement (if available)
      if (gamepad.axes && gamepad.axes.length >= 2) {
        const xAxis = gamepad.axes[0];
        const yAxis = gamepad.axes[1];
        
        // Only send input if there's significant movement
        if (Math.abs(xAxis) > 0.1 || Math.abs(yAxis) > 0.1) {
          this.Broadcast({
            topic: 'vr.controller.thumbstick',
            controllerIndex: controllerIndex,
            x: xAxis,
            y: yAxis
          });
        }
      }

      // Handle trigger input
      if (gamepad.buttons && gamepad.buttons[0]) {
        const triggerValue = gamepad.buttons[0].value;
        if (triggerValue > 0.1) {
          this.Broadcast({
            topic: 'vr.controller.trigger',
            controllerIndex: controllerIndex,
            value: triggerValue
          });
        }
      }
    }

    GetController(index) {
      return this._vrControllers[index]?.controller;
    }

    IsVRActive() {
      return this._isVRActive;
    }

    GetControllerWorldPosition(index) {
      const controller = this.GetController(index);
      if (controller) {
        const position = new THREE.Vector3();
        controller.getWorldPosition(position);
        return position;
      }
      return null;
    }

    GetControllerWorldDirection(index) {
      const controller = this.GetController(index);
      if (controller) {
        const direction = new THREE.Vector3(0, 0, -1);
        const matrix = new THREE.Matrix4();
        matrix.identity().extractRotation(controller.matrixWorld);
        direction.applyMatrix4(matrix);
        return direction.normalize();
      }
      return null;
    }
  }

  return {
    WebXRController: WebXRController,
  };

})();