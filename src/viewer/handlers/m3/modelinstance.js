import TexturedModelInstance from '../../texturedmodelinstance';
import M3Skeleton from './skeleton';

export default class M3ModelInstance extends TexturedModelInstance {
    /**
     * @extends {TexturedModelInstance}
     * @param {M3Model} model
     */
    constructor(model) {
        super(model);

        this.skeleton = null;
        this.teamColor = 0;
        this.vertexColor = new Uint8Array([255, 255, 255, 255]);
        this.sequence = -1;
        this.frame = 0;
        this.sequenceLoopMode = 0;

        this.forced = true;
    }

    initialize() {
        this.skeleton = new M3Skeleton(this);

        // This takes care of calling setSequence before the model is loaded.
        // In this case, this.sequence will be set, but nothing else is changed.
        // Now that the model is loaded, set it again to do the real work.
        if (this.sequence !== -1) {
            this.setSequence(this.sequence);
        }
    }

    updateTimers() {
        var sequenceId = this.sequence;

        if (sequenceId !== -1) {
            var sequence = this.model.sequences[sequenceId],
                interval = sequence.interval;

            this.frame += this.env.frameTime;

            if (this.frame > interval[1]) {
                if ((this.sequenceLoopMode === 0 && !(sequence.flags & 0x1)) || this.sequenceLoopMode === 2) {
                    this.frame = interval[0];
                } else {
                    this.frame = interval[1];
                }

                this.dispatchEvent({ type: 'seqend' });
            }
        }
    }

    update() {
        if (this.forced || this.sequence !== -1) {
            this.skeleton.update();
        }
    }

    // This is overriden in order to update the skeleton when the parent node changes
    recalculateTransformation() {
        super.recalculateTransformation();

        // If the instance is moved before it is loaded, the skeleton doesn't exist yet.
        if (this.skeleton) {
            this.skeleton.update();
        }
    }

    setTeamColor(id) {
        this.teamColor = id;

        return this;
    }

    setVertexColor(color) {
        this.vertexColor.set(color);

        return this;
    }

    setSequence(id) {
        this.sequence = id;
        this.frame = 0;

        if (this.model.loaded) {
            var sequences = this.model.sequences.length;

            if (id < -1 || id > sequences - 1) {
                id = -1;

                this.sequence = id;
            }

            // Do a forced update, so non-animated data can be skipped in future updates
            this.forced = true;
        }

        return this;
    }

    setSequenceLoopMode(mode) {
        this.sequenceLoopMode = mode;

        return this;

    }

    getAttachment(id) {
        var attachment = this.model.attachments[id];

        if (attachment) {
            return this.skeleton.nodes[attachment.bone];
        } else {
            return this.skeleton.parent;
        }
    }
};