import stringHash from '../../../common/stringhash';
import unique from '../../../common/arrayunique';
import MdxSdContainer from './sd';

/**
 * @constructor
 * @param {MdxModel} model
 * @param {MdxParserLayer} layer
 * @param {number} priorityPlane
 */
function MdxLayer(model, layer, layerId, priorityPlane) {
    let filterMode = layer.filterMode,
        textureAnimationId = layer.textureAnimationId,
        gl = model.env.gl;

    this.model = model;
    this.index = layerId;
    this.priorityPlane = priorityPlane;
    this.filterMode = filterMode;
    this.textureId = layer.textureId;
    this.coordId = layer.coordId;
    this.alpha = layer.alpha;
    this.sd = new MdxSdContainer(model, layer.tracks);

    var flags = layer.flags;

    this.unshaded = flags & 0x1;
    this.sphereEnvironmentMap = flags & 0x2;
    this.twoSided = flags & 0x10;
    this.unfogged = flags & 0x20;
    this.noDepthTest = flags & 0x40;
    this.noDepthSet = flags & 0x80;

    this.depthMaskValue = (filterMode === 0 || filterMode === 1) ? 1 : 0;
    this.alphaTestValue = (filterMode === 1) ? 1 : 0;

    let blended = (filterMode > 1) ? true : false;
    
    if (blended) {
        let blendSrc,
            blendDst;

        switch (filterMode) {
            // Blended
            case 2:
                blendSrc = gl.SRC_ALPHA;
                blendDst = gl.ONE_MINUS_SRC_ALPHA;
                break;
            // Additive
            case 3:
                blendSrc = gl.ONE;
                blendDst = gl.ONE;
                break;
            // Add Alpha (?)
            case 4:
                blendSrc = gl.SRC_ALPHA;
                blendDst = gl.ONE;
                break;
            // Modulate
            case 5:
                blendSrc = gl.ZERO;
                blendDst = gl.SRC_COLOR;
                break;
            // Modulate 2X
            case 6:
                blendSrc = gl.DST_COLOR;
                blendDst = gl.SRC_COLOR;
                break;
        }

        this.blendSrc = blendSrc;
        this.blendDst = blendDst;
    }

    this.blended = blended;

    this.uvDivisor = new Float32Array([1, 1]);

    if (textureAnimationId !== -1) {
        let textureAnimation = model.textureAnimations[textureAnimationId];

        if (textureAnimation) {
            this.textureAnimation = textureAnimation;
        }
    }

    let variants = {
        alpha: [],
        uv: [],
        slot: []
    };

    let hasAnim = false,
        hasSlotAnim = false,
        hasUvAnim = false;

    for (let i = 0, l = model.sequences.length; i < l; i++) {
        let alpha = this.isAlphaVariant(i),
            slot = this.isTextureIdVariant(i),
            uv = this.isTranslationVariant(i);

        if (alpha || slot || uv) {
            hasAnim = true;
        }

        if (slot) {
            hasSlotAnim = true;
        }

        if (uv) {
            hasUvAnim = true;
        }

        variants.alpha[i] = alpha;
        variants.slot[i] = slot;
        variants.uv[i] = uv;
    }

    this.variants = variants;
    this.hasAnim = hasAnim;
    this.hasSlotAnim = hasSlotAnim;
    this.hasUvAnim = hasUvAnim;

    this.setupVaryingTextures(model);
}

MdxLayer.prototype = {
    bind(shader) {
        let gl = this.model.env.gl;

        gl.uniform1f(shader.uniforms.get('u_alphaTest'), this.alphaTestValue);

        if (this.blended) {
            gl.enable(gl.BLEND);
            gl.blendFunc(this.blendSrc, this.blendDst);
        } else {
            gl.disable(gl.BLEND);
        }

        if (this.twoSided) {
            gl.disable(gl.CULL_FACE);
        } else {
            gl.enable(gl.CULL_FACE);
        }

        if (this.noDepthTest) {
            gl.disable(gl.DEPTH_TEST);
        } else {
            gl.enable(gl.DEPTH_TEST);
        }

        if (this.noDepthSet) {
            gl.depthMask(0);
        } else {
            gl.depthMask(this.depthMaskValue);
        }
    },

    setupVaryingTextures(model) {
        // Get all unique texture IDs used by this layer
        var textureIds = unique(this.sd.getValues('KMTF'));

        if (textureIds.length > 1) {
            let env = model.env,
                hash = stringHash(textureIds.join('')),
                textures = [];

            // Grab all of the textures
            for (let i = 0, l = textureIds.length; i < l; i++) {
                textures[i] = model.textures[textureIds[i]];
            }

            // Load ther atlas, and use the hash to cache it.
            model.handler.loadTextureAtlas(hash, textures, (atlas) => {
                model.textures.push(atlas.texture);

                this.textureId = model.textures.length - 1;
                this.uvDivisor.set([atlas.columns, atlas.rows]);
            });
        }
    },

    getAlpha(instance) {
        return this.sd.getValue('KMTA', instance, this.alpha);
    },

    isAlphaVariant(sequence) {
        return this.sd.isVariant('KMTA', sequence);
    },

    getTextureId(instance) {
        return this.sd.getValue('KMTF', instance, this.textureId);
        // TODO: map the returned slot to a texture atlas slot if one exists.
    },

    isTextureIdVariant(sequence) {
        return this.sd.isVariant('KMTF', sequence);
    },

    isTranslationVariant(sequence) {
        let textureAnimation = this.textureAnimation;

        if (textureAnimation) {
            return textureAnimation.isTranslationVariant(sequence);
        } else {
            return false;
        }
    }
};

export default MdxLayer;
