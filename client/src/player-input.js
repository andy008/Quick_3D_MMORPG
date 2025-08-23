import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.124/build/three.module.js';

import {entity} from "./entity.js";


export const player_input = (() => {

  class PickableComponent extends entity.Component {
    constructor() {
      super();
    }

    InitComponent() {
    }
  };

  class BasicCharacterControllerInput extends entity.Component {
    constructor(params) {
      super();
      this._params = params;
      this._Init();
    }
  
    _Init() {

      this.test = 'test';

      this._keys = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        space: false,
        shift: false,
        backspace: false,
      };

      this._mouse = new THREE.Vector2();
      this._windowHalf = new THREE.Vector2( window.innerWidth / 2, window.innerHeight / 2 );

      this._raycaster = new THREE.Raycaster();
      console.log('Init key and mouse listeners');

      document.addEventListener('mousemove', (e) => this.onMouseMove(e), false );
      document.addEventListener('keydown', (e) => this._onKeyDown(e), false);
      document.addEventListener('keyup', (e) => this._onKeyUp(e), false);
      document.addEventListener('mouseup', (e) => this._onMouseUp(e), false);

      // VR Controller support - handled by WebXR component
    }

    InitComponent() {
      // Register for VR events from WebXR component
      this._RegisterHandler('vr.controller.select', (m) => this._OnVRSelect(m));
      this._RegisterHandler('vr.controller.thumbstick', (m) => this._OnVRThumbstick(m));
      this._RegisterHandler('vr.controller.trigger', (m) => this._OnVRTrigger(m));
    }
  
    _onMouseUp(event) {
      const rect = document.getElementById('threejs').getBoundingClientRect();
      const pos = {
        x: ((event.clientX - rect.left) / rect.width) * 2  - 1,
        y: ((event.clientY - rect.top ) / rect.height) * -2 + 1,
      };

      this._raycaster.setFromCamera(pos, this._params.camera);

      const pickables = this.Manager.Filter((e) => {
        const p = e.GetComponent('PickableComponent');
        if (!p) {
          return false;
        }
        return e._mesh;
      });

      const ray = new THREE.Ray();
      ray.origin.setFromMatrixPosition(this._params.camera.matrixWorld);
      ray.direction.set(pos.x, pos.y, 0.5).unproject(
          this._params.camera).sub(ray.origin).normalize();

      // hack
      document.getElementById('quest-ui').style.visibility = 'hidden';

      for (let p of pickables) {
        // GOOD ENOUGH
        const box = new THREE.Box3().setFromObject(p._mesh);

        if (ray.intersectsBox(box)) {
          p.Broadcast({
              topic: 'input.picked'
          });
          break;
        }
      }
    }

    _onKeyDown(event) {
      if (event.currentTarget.activeElement != document.body) {
        return;
      }
      switch (event.keyCode) {
        case 87: // w
          this._keys.forward = true;
          break;
        case 65: // a
          this._keys.left = true;
          break;
        case 83: // s
          this._keys.backward = true;
          break;
        case 68: // d
          this._keys.right = true;
          break;
        case 32: // SPACE
          this._keys.space = true;
          break;
        case 16: // SHIFT
          this._keys.shift = true;
          break;
        case 8: // BACKSPACE
          this._keys.backspace = true;
          break;
      }
    }
  
    _onKeyUp(event) {
      if (event.currentTarget.activeElement != document.body) {
        return;
      }
      switch(event.keyCode) {
        case 87: // w
          this._keys.forward = false;
          break;
        case 65: // a
          this._keys.left = false;
          break;
        case 83: // s
          this._keys.backward = false;
          break;
        case 68: // d
          this._keys.right = false;
          break;
        case 32: // SPACE
          this._keys.space = false;
          break;
        case 16: // SHIFT
          this._keys.shift = false;
          break;
        case 8: // BACKSPACE
          this._keys.backspace = false;
          break;
      }
    }

    onMouseMove(event) {  
      if (event.currentTarget.activeElement != document.body) {
        return;
      }
      this._mouse.x = ( event.clientX - this._windowHalf.x );
      this._mouse.y = ( event.clientY - this._windowHalf.x );
  
      return;
    }

    _OnVRSelect(msg) {
      // Left controller (index 0) select = thumbstick press = SHIFT (run)
      if (msg.controllerIndex === 0) {
        this._keys.shift = msg.selecting;
      } else if (msg.controllerIndex === 1) {
        // Right controller select for interaction (keeping existing behavior)
        if (msg.selecting) {
          this._handleVRInteraction(null, msg.controllerIndex);
        }
      }
    }

    _OnVRThumbstick(msg) {
      // Map VR thumbstick to movement keys (left controller only - index 0)
      if (msg.controllerIndex !== 0) return;
      
      const threshold = 0.3;
      
      // Forward/backward movement (Y axis)
      this._keys.forward = msg.y < -threshold;
      this._keys.backward = msg.y > threshold;
      
      // Left/right movement (X axis)  
      this._keys.left = msg.x < -threshold;
      this._keys.right = msg.x > threshold;
    }

    _OnVRTrigger(msg) {
      // Map right controller trigger to SPACE action (right controller - index 1)
      if (msg.controllerIndex === 1) {
        this._keys.space = msg.value > 0.5; // Trigger threshold for SPACE action
      }
    }

    _handleVRInteraction(event, controllerIndex) {
      // Use WebXR component to get controller position and direction
      const webxr = this.FindEntity('webxr');
      if (!webxr) return;
      
      const webxrController = webxr.GetComponent('WebXRController');
      if (!webxrController) return;

      const controllerPosition = webxrController.GetControllerWorldPosition(controllerIndex);
      const controllerDirection = webxrController.GetControllerWorldDirection(controllerIndex);
      
      if (!controllerPosition || !controllerDirection) return;

      // Create raycaster from controller position and direction
      const raycaster = new THREE.Raycaster();
      raycaster.ray.origin.copy(controllerPosition);
      raycaster.ray.direction.copy(controllerDirection);

      // Check for pickable objects (similar to mouse interaction)
      const pickables = this.Manager.Filter((e) => {
        const p = e.GetComponent('PickableComponent');
        if (!p) {
          return false;
        }
        return e._mesh;
      });

      // Hide quest UI
      document.getElementById('quest-ui').style.visibility = 'hidden';

      for (let p of pickables) {
        const box = new THREE.Box3().setFromObject(p._mesh);
        if (raycaster.ray.intersectsBox(box)) {
          p.Broadcast({
              topic: 'input.picked'
          });
          break;
        }
      }
    }     
  };

  return {
    BasicCharacterControllerInput: BasicCharacterControllerInput,
    PickableComponent: PickableComponent,
  };

})();