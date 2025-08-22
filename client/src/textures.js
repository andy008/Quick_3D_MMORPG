import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.124/build/three.module.js';


export const textures = (function() {

  // Taken from https://github.com/mrdoob/three.js/issues/758
  function _GetImageData( image ) {
    var canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;

    var context = canvas.getContext('2d');
    context.drawImage( image, 0, 0 );

    return context.getImageData( 0, 0, image.width, image.height );
  }

  return {
    TextureAtlas: class {
      constructor(params) {
        this._threejs = params.threejs;
        this._Create();
        this.onLoad = () => {};
      }

      Load(atlas, names) {
        this._LoadAtlas(atlas, names);
      }

      _Create() {
        this._manager = new THREE.LoadingManager();
        this._loader = new THREE.TextureLoader(this._manager);
        this._textures = {};

        this._manager.onLoad = () => {
          this._OnLoad();
        };
      }

      get Info() {
        return this._textures;
      }

      _LoadTexture(n) {
        const t = this._loader.load(n);
        t.encoding = THREE.sRGBEncoding;
        return t;
      }

      _OnLoad() {
        console.log('TextureAtlas: Processing texture atlases...');
        for (let k in this._textures) {
          const atlas = this._textures[k];
          const targetSize = 1024; // Standardize all textures to 1024x1024
          const data = new Uint8Array(atlas.textures.length * 4 * targetSize * targetSize);

          for (let t = 0; t < atlas.textures.length; t++) {
            const curTexture = atlas.textures[t];
            let curData;
            
            // Check if texture needs resizing
            if (curTexture.image.width !== targetSize || curTexture.image.height !== targetSize) {
              console.log(`TextureAtlas: Resizing texture from ${curTexture.image.width}x${curTexture.image.height} to ${targetSize}x${targetSize}`);
              // Resize texture to target size
              curData = this._resizeImageData(curTexture.image, targetSize, targetSize);
            } else {
              curData = _GetImageData(curTexture.image);
            }
            
            const offset = t * (4 * targetSize * targetSize);
            data.set(curData.data, offset);
          }
    
          const diffuse = new THREE.DataTexture2DArray(data, targetSize, targetSize, atlas.textures.length);
          diffuse.format = THREE.RGBAFormat;
          diffuse.type = THREE.UnsignedByteType;
          diffuse.minFilter = THREE.LinearMipMapLinearFilter;
          diffuse.magFilter = THREE.LinearFilter;
          diffuse.wrapS = THREE.RepeatWrapping;
          diffuse.wrapT = THREE.RepeatWrapping;
          diffuse.generateMipmaps = true;
          diffuse.needsUpdate = true; // Critical: Tell Three.js to upload texture to GPU

          const caps = this._threejs.capabilities;
          const aniso = caps.getMaxAnisotropy();

          diffuse.anisotropy = 4;
          //diffuse.needsUpdate = true;
          atlas.atlas = diffuse;
        }

        console.log('TextureAtlas: All texture atlases loaded successfully');
        this.onLoad();
      }

      _resizeImageData(image, targetWidth, targetHeight) {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        const context = canvas.getContext('2d');
        // Use high-quality scaling
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, targetWidth, targetHeight);
        
        return context.getImageData(0, 0, targetWidth, targetHeight);
      }

      _LoadAtlas(atlas, names) {
        this._textures[atlas] = {
          textures: names.map(n => this._LoadTexture(n) ),
          atlas: null,
        };
      }
    }
  };
})();
