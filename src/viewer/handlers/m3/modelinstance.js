import {mat4} from 'gl-matrix';
import ModelInstance from '../../modelinstance';
import M3Skeleton from './skeleton';

const boneHeap = mat4.create();

/**
 * An M3 model instance.
 */
export default class M3ModelInstance extends ModelInstance {
  /**
   * @extends {TexturedModelInstance}
   * @param {M3Model} model
   */
  constructor(model) {
    super(model);

    this.skeleton = null;
    this.teamColor = 0;
    this.vertexColor = new Float32Array([1, 1, 1, 1]);
    this.sequence = -1;
    this.frame = 0;
    this.sequenceLoopMode = 0;
    this.sequenceEnded = false;

    this.forced = true;
  }

  /**
   *
   */
  load() {
    this.skeleton = new M3Skeleton(this);

    // This takes care of calling setSequence before the model is loaded.
    // In this case, this.sequence will be set, but nothing else is changed.
    // Now that the model is loaded, set it again to do the real work.
    if (this.sequence !== -1) {
      this.setSequence(this.sequence);
    }

    let model = this.model;
    let gl = model.viewer.gl;
    let numberOfBones = model.boneLookup.length;

    this.boneTexture = gl.createTexture();
    this.boneTextureWidth = numberOfBones * 4;
    this.vectorSize = 1 / this.boneTextureWidth;

    gl.activeTexture(gl.TEXTURE15);
    gl.bindTexture(gl.TEXTURE_2D, this.boneTexture);
    model.viewer.webgl.setTextureMode(gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.NEAREST, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, this.boneTextureWidth, 1, 0, gl.RGB, gl.FLOAT, null);
  }

  /**
   *
   */
  updateBoneTexture() {
    let model = this.model;
    let viewer = model.viewer;
    let gl = viewer.gl;
    let buffer = viewer.buffer;
    let boneLookup = model.boneLookup;
    let nodes = this.skeleton.nodes;
    let bindPose = model.initialReference;
    let count = boneLookup.length;
    let isAnimated = this.sequence !== -1;

    // Ensure there is enough memory for all of the instances data.
    buffer.reserve(count * 48);

    let floatView = buffer.floatView;
    let finalMatrix;

    if (isAnimated) {
      finalMatrix = boneHeap;
    } else {
      finalMatrix = this.worldMatrix;
    }

    for (let i = 0; i < count; i++) {
      let offset = i * 12;

      if (isAnimated) {
        let bone = boneLookup[i];

        // Every bone has to be multiplied by its bind pose counterpart for rendering.
        finalMatrix = mat4.mul(boneHeap, nodes[bone].worldMatrix, bindPose[bone]);
      }

      floatView[offset + 0] = finalMatrix[0];
      floatView[offset + 1] = finalMatrix[1];
      floatView[offset + 2] = finalMatrix[2];
      floatView[offset + 3] = finalMatrix[4];
      floatView[offset + 4] = finalMatrix[5];
      floatView[offset + 5] = finalMatrix[6];
      floatView[offset + 6] = finalMatrix[8];
      floatView[offset + 7] = finalMatrix[9];
      floatView[offset + 8] = finalMatrix[10];
      floatView[offset + 9] = finalMatrix[12];
      floatView[offset + 10] = finalMatrix[13];
      floatView[offset + 11] = finalMatrix[14];
    }

    // Update the buffer.
    buffer.bindAndUpdate(count * 48);


    gl.activeTexture(gl.TEXTURE15);
    gl.bindTexture(gl.TEXTURE_2D, this.boneTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.boneTextureWidth, 1, gl.RGB, gl.FLOAT, floatView);
  }

  /**
   * @override
   */
  renderOpaque() {
    let model = this.model;
    let batches = model.batches;

    if (batches.length) {
      let gl = model.viewer.gl;
      let vertexSize = model.vertexSize;
      let uvSetCount = model.uvSetCount;
      let shader = model.handler.shaders[uvSetCount - 1];
      let attribs = shader.attribs;
      let uniforms = shader.uniforms;
      let camera = this.scene.camera;
      let textureMapper = this.textureMapper;

      shader.use();

      gl.uniform1f(uniforms.u_teamColor, this.teamColor);
      gl.uniform4fv(uniforms.u_vertexColor, this.vertexColor);

      gl.uniformMatrix4fv(uniforms.u_mvp, false, camera.worldProjectionMatrix);
      gl.uniformMatrix4fv(uniforms.u_mv, false, camera.worldMatrix);

      gl.uniform3fv(uniforms.u_eyePos, camera.location);
      gl.uniform3fv(uniforms.u_lightPos, model.handler.lightPosition);

      gl.activeTexture(gl.TEXTURE15);
      gl.bindTexture(gl.TEXTURE_2D, this.boneTexture);
      gl.uniform1i(uniforms.u_boneMap, 15);
      gl.uniform1f(uniforms.u_vectorSize, this.vectorSize);
      gl.uniform1f(uniforms.u_rowSize, 1);

      gl.bindBuffer(gl.ARRAY_BUFFER, model.arrayBuffer);
      gl.vertexAttribPointer(attribs.a_position, 3, gl.FLOAT, false, vertexSize, 0);
      gl.vertexAttribPointer(attribs.a_weights, 4, gl.UNSIGNED_BYTE, false, vertexSize, 12);
      gl.vertexAttribPointer(attribs.a_bones, 4, gl.UNSIGNED_BYTE, false, vertexSize, 16);
      gl.vertexAttribPointer(attribs.a_normal, 4, gl.UNSIGNED_BYTE, false, vertexSize, 20);

      for (let i = 0; i < uvSetCount; i++) {
        gl.vertexAttribPointer(attribs[`a_uv${i}`], 2, gl.SHORT, false, vertexSize, 24 + i * 4);
      }

      gl.vertexAttribPointer(attribs.a_tangent, 4, gl.UNSIGNED_BYTE, false, vertexSize, 24 + uvSetCount * 4);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.elementBuffer);

      for (let batch of batches) {
        let material = batch.material;
        let region = batch.region;

        material.bind(shader, textureMapper);

        region.render(shader);

        material.unbind(shader); // This is required to not use by mistake layers from this material that were bound and are not overwritten by the next material
      }
    }
  }

  /**
   *
   */
  updateAnimations() {
    let sequenceId = this.sequence;

    if (sequenceId !== -1) {
      let sequence = this.model.sequences[sequenceId];
      let interval = sequence.interval;

      this.frame += this.model.viewer.frameTime;

      if (this.frame > interval[1]) {
        if ((this.sequenceLoopMode === 0 && !(sequence.flags & 0x1)) || this.sequenceLoopMode === 2) {
          this.frame = interval[0];
        } else {
          this.frame = interval[1];
        }

        this.sequenceEnded = true;
      } else {
        this.sequenceEnded = false;
      }
    }

    if (this.forced || sequenceId !== -1) {
      this.forced = false;

      this.skeleton.update();

      this.updateBoneTexture();
    }
  }

  /**
   * @param {number} id
   * @return {this}
   */
  setTeamColor(id) {
    this.teamColor = id;

    return this;
  }

  /**
   * @param {Uint8Array} color
   * @return {this}
   */
  setVertexColor(color) {
    this.vertexColor.set(color);

    return this;
  }

  /**
   * @param {number} id
   * @return {this}
   */
  setSequence(id) {
    this.sequence = id;
    this.frame = 0;

    if (this.model.ok) {
      let sequences = this.model.sequences.length;

      if (id < -1 || id > sequences - 1) {
        id = -1;

        this.sequence = id;
      }

      // Do a forced update, so non-animated data can be skipped in future updates
      this.forced = true;
    }

    return this;
  }

  /**
   * @param {number} mode
   * @return {this}
   */
  setSequenceLoopMode(mode) {
    this.sequenceLoopMode = mode;

    return this;
  }

  /**
   * @param {number} id
   * @return {?SkeletalNode}
   */
  getAttachment(id) {
    let attachment = this.model.attachments[id];

    if (attachment) {
      return this.skeleton.nodes[attachment.bone];
    }
  }
}
