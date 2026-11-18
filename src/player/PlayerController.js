import { PLAYER } from './PlayerBody.js';

/**
 * Keyboard / mouse input, pointer lock and camera. Drives a PlayerBody.
 */
export class PlayerController {
  constructor({ camera, canvas, body, sensitivity = 0.0022 }) {
    this.camera = camera;
    this.canvas = canvas;
    this.body = body;
    this.sensitivity = sensitivity;

    this.yaw = 0;
    this.pitch = 0;
    this.locked = false;
    this.mouseDown = false;
    this.keys = new Set();

    this.onLockChange = null; // (locked: boolean) => void
    this.onLockError = null;
    this.onKey = null; // (code: string) => void  (non-gameplay keys, e.g. F3)

    camera.rotation.order = 'YXZ';
    this._bind();
  }

  requestLock() {
    this.canvas.requestPointerLock();
  }

  _bind() {
    document.addEventListener('keydown', (e) => {
      if (this.locked && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.onKey) this.onKey(e.code);
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      const lim = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    });

    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.locked) this.mouseDown = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.mouseDown = false;
        this.keys.clear();
      }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.onLockError) this.onLockError();
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
  }

  update(dt) {
    const k = this.keys;
    this.body.update(dt, {
      moveX: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      moveZ: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
      jump: k.has('Space'),
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
      yaw: this.yaw,
    });
    this.syncCamera();
  }

  syncCamera() {
    const p = this.body.pos;
    this.camera.position.set(p.x, p.y + PLAYER.EYE, p.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
