import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.124/build/three.module.js';
import {entity} from "./entity.js";

export const webxr_component = (() => {

  class WebXRController extends entity.Component {
    constructor(params) {
      super();
      this._params = params;

      this._isVRActive = false;

      // XR rig pieces
      this._rig = null;          // world-space anchor you move around
      this._head = null;         // head offset node (parent of camera)
      this._origCameraParent = null;

      // Height handling
      this._xrHasFloor = false;  // true when using 'local-floor'
      this._headHeight = 1.7;    // fallback eye height if no floor

      // Controllers
      this._vrControllers = [];  // per-index state
      this._handToIndex = {};    // { left: idx, right: idx }

      this._tmpQ = null;
      this._tmpE = null;     
    }

    InitComponent() {
      this._setupWebXR();
    }

    // ---- tiny event emitter: window CustomEvents + optional internal bus ----
    _emit(topic, detail) {
      try { this.Broadcast?.({ topic, ...detail }); } catch (_) {}
      window.dispatchEvent(new CustomEvent(topic, { detail }));
    }

    _setupWebXR() {
      const { renderer, scene, camera } = this._params;
      if (!renderer || !renderer.xr) {
        console.warn('WebXR not available on this renderer');
        return;
      }

      // Prefer a floor-aligned reference space (if unsupported, we’ll fall back)
      if (renderer.xr.setReferenceSpaceType) {
        renderer.xr.setReferenceSpaceType('local-floor');
      }

      // Build the VR rig (proxy):  rig -> head -> camera
      this._rig = new THREE.Group();
      this._rig.name = 'XR_Rig';
      scene.add(this._rig);

      this._tmpQ = new THREE.Quaternion();
      this._tmpE = new THREE.Euler(0,0,0,'YXZ');       

      this._head = new THREE.Group();
      this._head.name = 'XR_Head';
      this._rig.add(this._head);

      // Controllers live under the rig so they move with the player
      for (let i = 0; i < 2; i++) this._setupController(i, renderer, this._rig);

      // Session lifecycle
      renderer.xr.addEventListener('sessionstart', async () => {
        // detect if floor ref space is actually available
        this._xrHasFloor = false;
        const session = renderer.xr.getSession?.();
        if (session && session.requestReferenceSpace) {
          try {
            await session.requestReferenceSpace('local-floor');
            this._xrHasFloor = true;
          } catch (_) { this._xrHasFloor = false; }
        }

        // Parent the camera into the rig under a head node
        if (camera) {
          this._origCameraParent = camera.parent || this._params.scene;
          this._head.add(camera);
          this._head.position.y = this._headHeight;
          // adjust head to be slightly in front of character
          this._head.position.z = -0.1;          
        }

        this._isVRActive = true;
        this._onVRSessionStart();
      });

      renderer.xr.addEventListener('sessionend', () => {
        // put camera back where it was
        const { camera, scene } = this._params;
        if (camera) {
          (this._origCameraParent || scene).add(camera);
          this._head.position.set(0,0,0);
        }
        this._isVRActive = false;
        this._onVRSessionEnd();
      });
    }

    _setupController(index, renderer, parentGroup) {
      const controller = renderer.xr.getController(index);
      controller.addEventListener('selectstart', (e)=>this._onSelectStart(e, index));
      controller.addEventListener('selectend',   (e)=>this._onSelectEnd(e, index));
      controller.addEventListener('connected',   (e)=>this._onControllerConnected(e, index));
      controller.addEventListener('disconnected',(e)=>this._onControllerDisconnected(e, index));
      parentGroup.add(controller);

      // Visible forward ray
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1)
      ]);
      const mat  = new THREE.LineBasicMaterial({ color: 0x00ff00 });
      const line = new THREE.Line(geom, mat);
      controller.add(line);

      const grip = renderer.xr.getControllerGrip(index);
      parentGroup.add(grip);

      this._vrControllers[index] = {
        controller, grip, line,
        isSelecting: false,
        gamepad: null,
        thumbstickPressed: false,
        handedness: 'unknown',
      };
    }

    _onSelectStart(_e, idx) {
      const c = this._vrControllers[idx]; if (!c) return;
      c.isSelecting = true;
      c.line.material.color.setHex(0xff0000);
      this._emit('vr.controller.select', {
        controllerIndex: idx, handedness: c.handedness,
        selecting: true, source: 'trigger'
      });
    }

    _onSelectEnd(_e, idx) {
      const c = this._vrControllers[idx]; if (!c) return;
      c.isSelecting = false;
      c.line.material.color.setHex(0x00ff00);
      this._emit('vr.controller.select', {
        controllerIndex: idx, handedness: c.handedness,
        selecting: false, source: 'trigger'
      });
    }

    _onControllerConnected(event, idx) {
      const c = this._vrControllers[idx]; if (!c) return;
      const hand = event.data?.handedness || (idx === 0 ? 'left' : 'right');
      c.handedness = hand;
      c.gamepad = event.data?.gamepad || null;
      this._handToIndex[hand] = idx;

      console.log(`VR Controller ${idx} (${hand}) connected`, {
        axes: c.gamepad?.axes?.length, buttons: c.gamepad?.buttons?.length
      });

      this._emit('vr.controller.connected', { controllerIndex: idx, handedness: hand, gamepad: c.gamepad });
    }

    _onControllerDisconnected(_event, idx) {
      const c = this._vrControllers[idx];
      if (c && this._handToIndex[c.handedness] === idx) delete this._handToIndex[c.handedness];
      this._emit('vr.controller.disconnected', { controllerIndex: idx });
    }

    _onVRSessionStart() {
      console.log('VR Session started');
      this._updateVRCameraPosition();

      const desktopUI = document.getElementById('game-ui');
      if (desktopUI) desktopUI.style.display = 'none';

      const tpc = this.FindEntity('player')?.GetComponent('ThirdPersonCamera');
      if (tpc) tpc._vrModeActive = true;

      this._emit('vr.session.start', {});
    }

    _onVRSessionEnd() {
      console.log('VR Session ended');

      const desktopUI = document.getElementById('game-ui');
      if (desktopUI) desktopUI.style.display = 'block';

      const tpc = this.FindEntity('player')?.GetComponent('ThirdPersonCamera');
      if (tpc) tpc._vrModeActive = false;

      this._emit('vr.session.end', {});
    }

    Update() {
      if (!this._isVRActive) return;

      // Keep rig snapped to player/terrain
      this._updateVRCameraPosition();

      // Poll gamepads each frame (robust across runtimes)
      const session = this._params.renderer.xr.getSession?.();
      for (let i = 0; i < this._vrControllers.length; i++) {
        const c = this._vrControllers[i]; if (!c) continue;

        if (session && session.inputSources) {
          for (const src of session.inputSources) {
            if (!src.gamepad) continue;
            if (src.handedness && src.handedness === c.handedness) {
              c.gamepad = src.gamepad; break;
            }
          }
        }
        if (c.gamepad) this._updateControllerInput(i, c);
      }
    }

    // === THE "PROXY" RIG UPDATE ===
    _updateVRCameraPosition() {
      const player = this.FindEntity('player');
      if (!player || !player._position || !this._rig) return;

      const p = player._position.clone();

      // snap rig to ground at player XZ
      const terrain = this.FindEntity('terrain')?.GetComponent('TerrainChunkManager');
      if (terrain) {
        const h = terrain.GetHeight(p)[0];
        this._rig.position.set(p.x, h, p.z);
      } else {
        this._rig.position.copy(p);
      }

      // keep head offset you set earlier
      if (this._head) this._head.position.y = this._headHeight;

      // <<< NEW: align rig yaw to player yaw
      const playerYawQ = this._getPlayerYawQuat();
      if (playerYawQ) {
        // snap:
        this._rig.quaternion.copy(playerYawQ);

        // or smooth, if you prefer (0..1):
        // this._rig.quaternion.slerp(playerYawQ, 0.25);
      }
    }


    _getPlayerYawQuat() {
      const player = this.FindEntity('player');
      if (!player) return null;

      // Try to read rotation from a mesh if present
      if (player._mesh && player._mesh.getWorldQuaternion) {
        player._mesh.getWorldQuaternion(this._tmpQ);
      } else if (player._quaternion) {
        this._tmpQ.copy(player._quaternion);
      } else if (player._rotation) {
        this._tmpE.set(0, player._rotation.y || 0, 0, 'YXZ');
        this._tmpQ.setFromEuler(this._tmpE);
      } else {
        return null;
      }

      // isolate yaw only
      this._tmpE.setFromQuaternion(this._tmpQ, 'YXZ');
      this._tmpE.x = 0; this._tmpE.z = 0;
      this._tmpQ.setFromEuler(this._tmpE);
      return this._tmpQ;
    }      

    _deadzone(v, dz = 0.45) { return Math.abs(v) < dz ? 0 : v; }
    _pickStickAxes(axes = []) {
      const x0 = axes[0] || 0, y0 = axes[1] || 0;
      const x2 = axes[2] || 0, y2 = axes[3] || 0;
      const m01 = x0*x0 + y0*y0, m23 = x2*x2 + y2*y2;
      return (m23 >= m01) ? { x: x2, y: y2 } : { x: x0, y: y0 };
    }

    _updateControllerInput(index, c) {
      const gp = c.gamepad, hand = c.handedness;

      if (gp.axes && gp.axes.length) {
        const { x, y } = this._pickStickAxes(gp.axes);
        this._emit('vr.controller.thumbstick', {
          controllerIndex: index, handedness: hand,
          x: this._deadzone(x), y: this._deadzone(y)
        });
      }

      // Thumbstick press (common mappings 3 or 9)
      const btnStick = gp.buttons && (gp.buttons[3] || gp.buttons[9]);
      if (btnStick) {
        const pressed = !!btnStick.pressed;
        if (pressed !== c.thumbstickPressed) {
          c.thumbstickPressed = pressed;
          this._emit('vr.controller.select', {
            controllerIndex: index, handedness: hand,
            selecting: pressed, source: 'thumbstick'
          });
        }
      }

      // Trigger analog (button 0 most devices)
      const trig = gp.buttons && gp.buttons[0];
      if (trig) {
        const val = trig.value || (trig.pressed ? 1 : 0);
        if (val > 0.05) {
          this._emit('vr.controller.trigger', {
            controllerIndex: index, handedness: hand, value: val
          });
        }
      }
    } 

    // Helpers for picking/interactions
    GetController(index) { return this._vrControllers[index]?.controller; }
    IsVRActive() { return this._isVRActive; }

    GetControllerWorldPosition(index) {
      const c = this.GetController(index); if (!c) return null;
      const v = new THREE.Vector3(); c.getWorldPosition(v); return v;
    }

    GetControllerWorldDirection(index) {
      const c = this.GetController(index); if (!c) return null;
      const dir = new THREE.Vector3(0,0,-1);
      const m = new THREE.Matrix4().extractRotation(c.matrixWorld);
      return dir.applyMatrix4(m).normalize();
    }
  }

  return { WebXRController };
})();
