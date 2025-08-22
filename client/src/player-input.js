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

      // VR Controller support
      this._vrControllers = [];
      this._initVRControllers();
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

    _initVRControllers() {
      // This will be called to setup VR controllers when needed
      if (!this._params.renderer || !this._params.renderer.xr) {
        return;
      }

      const renderer = this._params.renderer;
      const scene = this._params.scene;

      // Create controller models
      for (let i = 0; i < 2; i++) {
        const controller = renderer.xr.getController(i);
        controller.addEventListener('selectstart', (event) => this._onVRSelectStart(event, i));
        controller.addEventListener('selectend', (event) => this._onVRSelectEnd(event, i));
        controller.addEventListener('connected', (event) => this._onVRControllerConnected(event, i));
        scene.add(controller);

        const controllerGrip = renderer.xr.getControllerGrip(i);
        scene.add(controllerGrip);

        this._vrControllers.push({
          controller: controller,
          grip: controllerGrip,
          isSelecting: false
        });
      }
    }

    _onVRSelectStart(event, controllerIndex) {
      if (this._vrControllers[controllerIndex]) {
        this._vrControllers[controllerIndex].isSelecting = true;
        this._handleVRInteraction(event, controllerIndex);
      }
    }

    _onVRSelectEnd(event, controllerIndex) {
      if (this._vrControllers[controllerIndex]) {
        this._vrControllers[controllerIndex].isSelecting = false;
      }
    }

    _onVRControllerConnected(event, controllerIndex) {
      console.log(`VR Controller ${controllerIndex} connected:`, event.data);
    }

    _handleVRInteraction(event, controllerIndex) {
      const controller = this._vrControllers[controllerIndex]?.controller;
      if (!controller) return;

      // Create raycaster from controller position and direction
      const tempMatrix = new THREE.Matrix4();
      tempMatrix.identity().extractRotation(controller.matrixWorld);
      
      const raycaster = new THREE.Raycaster();
      raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

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