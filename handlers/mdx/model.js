/**
 * @constructor
 * @augments Model
 * @memberOf Mdx
 * @param {ModelViewer} env
 * @param {function(?)} pathSolver
 */
function MdxModel(env, pathSolver) {
    TexturedModel.call(this, env, pathSolver);

    this.sequences = [];
    this.textures = [];
    this.geosets = [];
    this.cameras = [];
    this.particleEmitters = [];
    this.particleEmitters2 = [];
    this.ribbonEmitters = [];
    this.boundingShapes = [];
    this.attachments = [];
    this.textureAnimations = [];
    this.geosetAnimations = [];
    this.eventObjectEmitters = [];
}

MdxModel.prototype = {
    initialize(src) {
        var parser;
        
        //try {
            parser = new MdxParser(src);
        //} catch (e) {
        //    this.onerror("InvalidSource", e);
        //    return false;
        //}

        var objects, i, l, j, k;
        var chunks = parser.chunks;

        this.parser = parser;
        this.name = chunks.get("MODL").name;

        this.replaceables = [];

        this.textureAtlases = {};

        if (chunks.has("TEXS")) {
            objects = chunks.get("TEXS").elements;

            for (i = 0, l = objects.length; i < l; i++) {
                this.loadTexture(objects[i]);
            }
        }

        if (chunks.has("SEQS")) {
            this.sequences = chunks.get("SEQS").elements;
        }

        if (chunks.has("GLBS")) {
            this.globalSequences = chunks.get("GLBS").elements;
        }

        var nodes = parser.nodes;
        var pivots;

        if (chunks.has("PIVT")) {
            pivots = chunks.get("PIVT").elements;
        } else {
            pivots = [{ value: [0, 0, 0] }];
        }

        this.nodes = [];
        this.sortedNodes = [];

        for (i = 0, l = nodes.length; i < l; i++) {
            this.nodes[i] = new MdxNode(this, nodes[i], pivots);
        }

        if (this.nodes.length === 0) {
            this.nodes[0] = new MdxNode(this, { objectId: 0, parentId: -1 }, pivots);
        }

        // This list is used to access all the nodes in a loop while keeping the hierarchy in mind.
        this.hierarchy = this.setupHierarchy([], this.nodes, -1);

        for (i = 0, l = this.nodes.length; i < l; i++) {
            this.sortedNodes[i] = this.nodes[this.hierarchy[i]];
        }

        // Checks what sequences are variant or not
        this.setupVariants();

        if (chunks.has("BONE")) {
            this.bones = chunks.get("BONE").elements;
        } else {
            // If there are no bones, reference the injected root node, since the shader requires at least one bone
            this.bones = [{ node: { objectId: 0, index: 0 } }];
        }

        if (chunks.has("TXAN")) {
            let textureAnimations = chunks.get("TXAN").elements;

            for (let i = 0, l = textureAnimations.length; i < l; i++) {
                this.textureAnimations[i] = new MdxTextureAnimation(this, textureAnimations[i]);
            }
        }

        if (chunks.has("MTLS")) {
            objects = chunks.get("MTLS").elements;

            var materials = [];

            var layerId = 0;

            this.layers = [];

            for (i = 0, l = objects.length; i < l; i++) {
                var layers = objects[i].layers;

                materials[i] = [];

                for (j = 0, k = layers.length; j < k; j++) {
                    var layer = new MdxLayer(this, layers[j], layerId, objects[i].priorityPlane);

                    layerId += 1;

                    materials[i][j] = layer;
                    this.layers.push(layer);

                    this.setupVaryingTextures(layer);
                }
            }

            this.materials = materials;

            this.hasTextureAnims = !!this.textureAnimations.length;
            this.hasLayerAnims = false;
        }

        if (chunks.has("GEOA")) {
            let geosetAnimations = chunks.get("GEOA").elements;

            for (let i = 0, l = geosetAnimations.length; i < l; i++) {
                this.geosetAnimations[i] = new MdxGeosetAnimation(this, geosetAnimations[i]);
            }
        }

        if (chunks.has("GEOS")) {
            let geosets = chunks.get("GEOS").elements,
                opaqueBatches = [],
                translucentBatches = [],
                batchId = 0;

            for (i = 0, l = geosets.length; i < l; i++) {
                let geoset = geosets[i],
                    layers = materials[geoset.materialId],
                    mesh = new MdxGeoset(geoset, this.geosetAnimations);

                this.geosets.push(mesh);

                for (j = 0, k = layers.length; j < k; j++) {
                    layer = layers[j];

                    var batch = new MdxBatch(batchId, layer, mesh);

                    if (layer.filterMode < 2) {
                        opaqueBatches.push(batch);
                    } else {
                        translucentBatches.push(batch);
                    }

                    batchId += 1;
                }
            }

            translucentBatches.sort((a, b) => a.layer.priorityPlane - b.layer.priorityPlane);

            this.batches = opaqueBatches.concat(translucentBatches);
            this.opaqueBatches = opaqueBatches;
            this.translucentBatches = translucentBatches;
        } else {
            this.batches = [];
        }

        this.setupGeosets();

        if (chunks.has("CAMS")) {
            let cameras = chunks.get("CAMS").elements;

            for (let i = 0, l = cameras.length; i < l; i++) {
                this.cameras[i] = new MdxCamera(this, cameras[i]);
            }
        }

        if (chunks.has("PREM")) {
            this.particleEmitters = chunks.get("PREM").elements;
        }

        if (chunks.has("PRE2")) {
            this.particleEmitters2 = chunks.get("PRE2").elements;

            this.particleEmitters2.sort((a, b) => a.priorityPlane - b.priorityPlane);
        }

        if (chunks.has("RIBB")) {
            this.ribbonEmitters = chunks.get("RIBB").elements;
        }

        if (chunks.has("CLID")) {
            this.boundingShapes = chunks.get("CLID").elements;
        }

        if (chunks.has("ATCH")) {
            let attachments = chunks.get("ATCH").elements;

            for (let i = 0, l = attachments.length; i < l; i++) {
                this.attachments[i] = new MdxAttachment(this, attachments[i]);
            }
        }

        if (chunks.has("EVTS")) {
            let eventObjects = chunks.get("EVTS").elements;

            for (let i = 0, l = eventObjects.length; i < l; i++) {
                this.eventObjectEmitters.push(new MdxEventObject(this, eventObjects[i]));
            }
        }

        this.calculateExtent();

        return true;
    },

    isVariant(sequence) {
        let nodes = this.nodes;

        for (let i = 0, l = nodes.length; i < l; i++) {
            if (nodes[i].isVariant(sequence)) {
                return true;
            }
        }
        
        return false;
    },

    setupVariants() {
        let variants = [];

        for (let i = 0, l = this.sequences.length; i < l; i++) {
            variants[i] = this.isVariant(i);
        }

        this.variants = variants;
    },

    setupVaryingTextures(layer) {
        // Get all unique texture IDs used by this layer
        let textureIds = layer.getAllTextureIds();

        if (textureIds.length > 1) {
            let hash = hashFromArray(textureIds),
                textures = [];

            // Grab all of the textures
            for (let i = 0, l = textureIds.length; i < l; i++) {
                textures[i] = this.textures[textureIds[i]];
            }
            
            // When all of the textures are loaded, it's time to construct a texture atlas
            this.env.whenLoaded(textures, () => {
                let textureAtlases = this.textureAtlases;

                // Cache atlases
                if (!textureAtlases[hash]) {
                    let images = [];

                    // Grab all the ImageData objects from the loaded textures
                    for (let i = 0, l = textures.length; i < l; i++) {
                        images[i] = textures[i].imageData;
                    }

                    // Finally create the atlas
                    let atlasData = createTextureAtlas(images);

                    textureAtlases[hash] = { textureId: this.textures.length, columns: atlasData.columns, rows: atlasData.rows };
                    
                    this.textures.push(this.env.load(atlasData.texture));
                }

                // Tell the layer to use this texture atlas, instead of its original texture
                layer.setAtlas(textureAtlases[hash]);

                this.hasLayerAnims = true;
            });
        }
    },

    setupGeosets() {
        let geosets = this.geosets;

        if (geosets.length > 0) {
            let gl = this.gl,
                shallowGeosets = [],
                typedArrays = [],
                totalArrayOffset = 0,
                elementTypedArrays = [],
                totalElementOffset = 0,
                i, l;

            for (i = 0, l = geosets.length; i < l; i++) {
                let geoset = geosets[i],
                    vertices = geoset.locationArray,
                    normals = geoset.normalArray,
                    uvSets = geoset.uvsArray,
                    boneIndices = geoset.boneIndexArray,
                    boneNumbers = geoset.boneNumberArray,
                    faces = geoset.faceArray,
                    verticesOffset = totalArrayOffset,
                    normalsOffset = verticesOffset + vertices.byteLength,
                    uvSetsOffset = normalsOffset + normals.byteLength,
                    boneIndicesOffset = uvSetsOffset + uvSets.byteLength,
                    boneNumbersOffset = boneIndicesOffset + boneIndices.byteLength;

                shallowGeosets[i] = new MdxShallowGeoset(this, [verticesOffset, normalsOffset, uvSetsOffset, boneIndicesOffset, boneNumbersOffset, totalElementOffset], geoset.uvSetSize, faces.length);

                typedArrays.push([verticesOffset, vertices]);
                typedArrays.push([normalsOffset, normals]);
                typedArrays.push([uvSetsOffset, uvSets]);
                typedArrays.push([boneIndicesOffset, boneIndices]);
                typedArrays.push([boneNumbersOffset, boneNumbers]);

                elementTypedArrays.push([totalElementOffset, faces]);

                totalArrayOffset = boneNumbersOffset + boneNumbers.byteLength;
                totalElementOffset += faces.byteLength;
            }

            let arrayBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, totalArrayOffset, gl.STATIC_DRAW);

            for (i = 0, l = typedArrays.length; i < l; i++) {
                gl.bufferSubData(gl.ARRAY_BUFFER, typedArrays[i][0], typedArrays[i][1]);
            }

            let faceBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, faceBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, totalElementOffset, gl.STATIC_DRAW);

            for (i = 0, l = elementTypedArrays.length; i < l; i++) {
                gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, elementTypedArrays[i][0], elementTypedArrays[i][1]);
            }

            this.__webglArrayBuffer = arrayBuffer;
            this.__webglElementBuffer = faceBuffer;
            this.shallowGeosets = shallowGeosets;
        }
    },

    setupHierarchy(hierarchy, nodes, parent) {
        for (let i = 0, l = nodes.length; i < l; i++) {
            let node = nodes[i];

            if (node.parentId === parent) {
                hierarchy.push(i);

                this.setupHierarchy(hierarchy, nodes, node.objectId);
            }
        }

        return hierarchy;
    },

    loadTexture(texture) {
        var path = texture.path;
        var replaceableId = texture.replaceableId;

        if (replaceableId !== 0) {
            path = "replaceabletextures/" + Mdx.replaceableIdToName[replaceableId] + ".blp";
        }

        // If the path is corrupted, try to fix it.
        if (!path.endsWith(".blp") || !path.endsWith(".tga")) {
            // Try to search for .blp
            var index = path.indexOf(".blp");

            if (index === -1) {
                // Not a .blp, try to search for .tga
                index = path.indexOf(".tga");
            }

            if (index !== -1) {
                // Hopefully fix the path
                path = path.slice(0, index + 4);
            }
        }

        this.replaceables.push(replaceableId);
        this.textures.push(this.env.load(path, this.pathSolver));
    },

    calculateExtent() {
        var meshes = this.geosets;
        var mesh;
        var min, max;
        var x, y, z;
        var minX = 1E9, minY = 1E9, minZ = 1E9;
        var maxX = -1E9, maxY = -1E9, maxZ = -1E9;
        var dX, dY, dZ;
        var i, l;

        for (i = 0, l = meshes.length; i < l; i++) {
            mesh = meshes[i];
            mesh.calculateExtent();

            min = mesh.extent.min;
            max = mesh.extent.max;
            x = min[0];
            y = min[1];
            z = min[2];

            if (x < minX) {
                minX = x;
            }

            if (y < minY) {
                minY = y;
            }

            if (z < minZ) {
                minZ = z;
            }

            x = max[0];
            y = max[1];
            z = max[2];

            if (x > maxX) {
                maxX = x;
            }

            if (y > maxY) {
                maxY = y;
            }

            if (z > maxZ) {
                maxZ = z;
            }
        }

        dX = maxX - minX;
        dY = maxY - minY;
        dZ = maxZ - minZ;

        this.extent = {radius: Math.sqrt(dX * dX + dY * dY + dZ * dZ) / 2, min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
    },

    bind(bucket, scene) {
        const webgl = this.env.webgl;
        var gl = this.gl;

        // HACK UNTIL I IMPLEMENT MULTIPLE SHADERS AGAIN

        var shader = this.env.shaderMap.get("MdxStandardShader");
        webgl.useShaderProgram(shader);
        this.shader = shader;

        const instancedArrays = gl.extensions.instancedArrays;
        const attribs = shader.attribs;
        const uniforms = shader.uniforms;

        gl.uniformMatrix4fv(uniforms.get("u_mvp"), false, scene.camera.worldProjectionMatrix);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.__webglElementBuffer);

        gl.uniform1i(uniforms.get("u_texture"), 0);

        // Team colors
        let teamColor = attribs.get("a_teamColor");
        gl.bindBuffer(gl.ARRAY_BUFFER, bucket.teamColorBuffer);
        gl.vertexAttribPointer(teamColor, 1, gl.UNSIGNED_BYTE, false, 1, 0);
        instancedArrays.vertexAttribDivisorANGLE(teamColor, 1);

        // Vertex colors
        let vertexColor = attribs.get("a_vertexColor");
        gl.bindBuffer(gl.ARRAY_BUFFER, bucket.vertexColorBuffer);
        gl.vertexAttribPointer(vertexColor, 4, gl.UNSIGNED_BYTE, true, 4, 0); // normalize the colors from [0, 255] to [0, 1] here instead of in the pixel shader
        instancedArrays.vertexAttribDivisorANGLE(vertexColor, 1);

        gl.activeTexture(gl.TEXTURE15);
        gl.bindTexture(gl.TEXTURE_2D, bucket.boneTexture);
        gl.uniform1i(uniforms.get("u_boneMap"), 15);
        gl.uniform1f(uniforms.get("u_vectorSize"), bucket.vectorSize);
        gl.uniform1f(uniforms.get("u_rowSize"), bucket.rowSize);

        let instanceId = attribs.get("a_InstanceID");
        gl.bindBuffer(gl.ARRAY_BUFFER, bucket.instanceIdBuffer);
        gl.vertexAttribPointer(instanceId, 1, gl.UNSIGNED_SHORT, false, 0, 0);
        instancedArrays.vertexAttribDivisorANGLE(instanceId, 1);
    },

    unbind() {
        let gl = this.gl,
            instancedArrays = gl.extensions.instancedArrays,
            attribs = this.shader.attribs;

        // Reset gl values to default, to play nice with other handlers
        gl.depthMask(1);
        gl.disable(gl.BLEND);
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);

        // Reset the attributes to play nice with other handlers
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_teamColor"), 0);
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_vertexColor"), 0);
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_InstanceID"), 0);
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_batchVisible"), 0);
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_geosetColor"), 0);
        instancedArrays.vertexAttribDivisorANGLE(attribs.get("a_uvOffset"), 0);
    },

    renderBatch(bucket, batch) {
        let gl = this.gl,
            instancedArrays = gl.extensions.instancedArrays,
            shader = this.shader,
            attribs = this.shader.attribs,
            uniforms = shader.uniforms,
            layer = batch.layer,
            shallowGeoset = this.shallowGeosets[batch.geoset.index],
            replaceable = this.replaceables[layer.textureId],
            colorMode = 0;

        layer.bind(shader);

        // Team color
        if (replaceable === 1) {
            colorMode = 1;
        // Team glow
        } else if (replaceable === 2) {
            colorMode = 2;
        }
        
        gl.uniform1f(uniforms.get("u_colorMode"), colorMode);

        let texture;

        // If this is not a team color/glow, set the texture, and see if it's a texture animation.
        if (colorMode === 0) {
            texture = this.textures[layer.textureId];

            // Does this layer use texture animations with multiple textures?
            gl.uniform1f(uniforms.get("u_isTextureAnim"), layer.isTextureAnim);
        }

        // When this is a team color/glow, texture is undefined, so the black texture will get bound.
        // This is better than not binding anything at all, since that can lead to WebGL errors.
        this.bindTexture(texture, 0, bucket.modelView);

        // Batch visibilities
        let batchVisible = attribs.get("a_batchVisible");
        gl.bindBuffer(gl.ARRAY_BUFFER, bucket.batchVisibilityBuffers[batch.index]);
        gl.vertexAttribPointer(batchVisible, 1, gl.UNSIGNED_BYTE, false, 1, 0);
        instancedArrays.vertexAttribDivisorANGLE(batchVisible, 1);

        // Geoset colors
        let geosetColor = attribs.get("a_geosetColor");
        gl.bindBuffer(gl.ARRAY_BUFFER, bucket.geosetColorBuffers[batch.index]);
        gl.vertexAttribPointer(geosetColor, 4, gl.UNSIGNED_BYTE, true, 4, 0);
        instancedArrays.vertexAttribDivisorANGLE(geosetColor, 1);

        // Texture coordinate animations
        let uvOffset = attribs.get("a_uvOffset");
        gl.bindBuffer(gl.ARRAY_BUFFER, bucket.uvOffsetBuffers[layer.index]);
        gl.vertexAttribPointer(uvOffset, 4, gl.FLOAT, false, 16, 0);
        instancedArrays.vertexAttribDivisorANGLE(uvOffset, 1);

        // Texture coordinate divisor
        // Used for layers that use image animations, in order to scale the coordinates to match the generated texture atlas
        gl.uniform2f(uniforms.get("u_uvScale"), 1 / layer.uvDivisor[0], 1 / layer.uvDivisor[1]);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.__webglArrayBuffer);
        shallowGeoset.bind(shader, layer.coordId);

        shallowGeoset.render(bucket.instances.length);
    },

    renderBatches(bucket, scene, batches) {
        if (batches && batches.length) {
            const updateBatches = bucket.updateBatches;

            this.bind(bucket, scene);

            for (let i = 0, l = batches.length; i < l; i++) {
                const batch = batches[i];

                if (updateBatches[batch.index]) {
                    this.renderBatch(bucket, batch);
                }
            }

            this.unbind();
        }
    },

    renderOpaque(bucket, scene) {
        this.renderBatches(bucket, scene, this.opaqueBatches);
    },

    renderTranslucent(bucket, scene) {
        this.renderBatches(bucket, scene, this.translucentBatches);
    },

    renderEmitters(bucket, scene) {
        let webgl = this.env.webgl,
            gl = this.env.gl,
            particleEmitters2 = bucket.particleEmitters2,
            eventObjectEmitters = bucket.eventObjectEmitters,
            ribbonEmitters = bucket.ribbonEmitters;


        if (particleEmitters2.length || eventObjectEmitters.length || ribbonEmitters.length) {
            gl.depthMask(0);
            gl.enable(gl.BLEND);
            gl.disable(gl.CULL_FACE);
            gl.enable(gl.DEPTH_TEST);

            var shader = this.env.shaderMap.get("MdxParticleShader");
            webgl.useShaderProgram(shader);

            gl.uniformMatrix4fv(shader.uniforms.get("u_mvp"), false, scene.camera.worldProjectionMatrix);

            gl.uniform1i(shader.uniforms.get("u_texture"), 0);

            for (let i = 0, l = particleEmitters2.length; i < l; i++) {
                particleEmitters2[i].render(bucket, shader);
            }

            for (let i = 0, l = eventObjectEmitters.length; i < l; i++) {
                eventObjectEmitters[i].render(bucket, shader);
            }
        }

        if (ribbonEmitters.length) {
            var shader = this.env.shaderMap.get("MdxRibbonShader");
            webgl.useShaderProgram(shader);

            gl.uniformMatrix4fv(shader.uniforms.get("u_mvp"), false, scene.camera.worldProjectionMatrix);

            gl.uniform1i(shader.uniforms.get("u_texture"), 0);

            for (let i = 0, l = ribbonEmitters.length; i < l; i++) {
                ribbonEmitters[i].render(bucket, shader);
            }
        }
    }
};

mix(MdxModel.prototype, TexturedModel.prototype);
