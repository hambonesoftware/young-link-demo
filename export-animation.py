"""Bake the character control rig's Idle, Walk and Run actions for the demo.

blender -b max-animated.blend --python export-animation.py -- docs/assets/max.glb
"""

from pathlib import Path
import sys

import bpy


def export(output):
    scene = bpy.context.scene
    rig = next(obj for obj in scene.objects if obj.type == 'ARMATURE' and 'mr_control_rig' in obj.data)
    body = next(child for child in rig.children if child.type == 'MESH')
    clips = [bpy.data.actions[name] for name in ('Idle', 'Walk', 'Run')]
    deform_bones = [bone for bone in rig.data.bones if bone.name.startswith('mixamorig:')]
    if rig.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')

    character = scene.get('Character', 'Link')
    skeleton = bpy.data.armatures.new(f'{character} Deform Skeleton')
    exported_rig = bpy.data.objects.new(character, skeleton)
    scene.collection.objects.link(exported_rig)
    bpy.ops.object.select_all(action='DESELECT')
    exported_rig.select_set(True)
    bpy.context.view_layer.objects.active = exported_rig
    bpy.ops.object.mode_set(mode='EDIT')
    for bone in deform_bones:
        dst = skeleton.edit_bones.new(bone.name)
        dst.head = bone.head_local
        dst.tail = bone.tail_local
        dst.align_roll(bone.matrix_local.to_3x3().col[2])
    for bone in deform_bones:
        ancestor = bone.parent
        while ancestor and ancestor.name not in skeleton.edit_bones:
            ancestor = ancestor.parent
        if ancestor:
            skeleton.edit_bones[bone.name].parent = skeleton.edit_bones[ancestor.name]
    bpy.ops.object.mode_set(mode='OBJECT')

    actions = []
    for source in clips:
        rig.animation_data.action = source
        rig.animation_data.action_slot = source.slots[0]
        action = bpy.data.actions.new(f'{source.name} (baked)')
        action.use_fake_user = True
        action['Nominal ground speed'] = source['Nominal ground speed']
        slot = action.slots.new('OBJECT', exported_rig.name)
        exported_rig.animation_data_create()
        exported_rig.animation_data.action = action
        exported_rig.animation_data.action_slot = slot
        start, end = (round(frame) for frame in source.frame_range)

        for frame in range(start, end + 1):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            for dst in exported_rig.pose.bones:
                parent = dst.parent
                parent_data = ({
                    'parent_matrix': rig.pose.bones[parent.name].matrix,
                    'parent_matrix_local': parent.bone.matrix_local,
                } if parent else {})
                local = dst.bone.convert_local_to_pose(
                    rig.pose.bones[dst.name].matrix, dst.bone.matrix_local,
                    invert=True, **parent_data,
                )
                dst.location, rotation, dst.scale = local.decompose()
                dst.rotation_mode = 'QUATERNION'
                rotation.make_compatible(dst.rotation_quaternion)
                dst.rotation_quaternion = rotation
                for prop in ('location', 'rotation_quaternion', 'scale'):
                    dst.keyframe_insert(data_path=prop, frame=frame, group=dst.name)

        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = 'LINEAR'
        actions.append((source.name, action))

    body.parent = exported_rig
    modifier = next(mod for mod in body.modifiers if mod.type == 'ARMATURE')
    modifier.object = exported_rig
    for mat in body.data.materials:
        if not mat or not mat.use_nodes:
            continue
        shader = mat.node_tree.nodes.get('Principled BSDF')
        if not shader:
            continue
        if mat.get('toon_shadow'):
            output_node = mat.node_tree.nodes.get('Material Output')
            mat.node_tree.links.new(shader.outputs['BSDF'], output_node.inputs['Surface'])
        for link in list(shader.inputs['Normal'].links):
            mat.node_tree.links.remove(link)
        for link in list(shader.inputs['Base Color'].links):
            if link.from_node.type != 'VERTEX_COLOR':
                mat.node_tree.links.remove(link)
                shader.inputs['Base Color'].default_value = mat.diffuse_color

    bpy.data.objects.remove(rig, do_unlink=True)
    for action in list(bpy.data.actions):
        if action not in [baked for _, baked in actions]:
            bpy.data.actions.remove(action)
    for name, action in actions:
        action.name = name
    exported_rig.animation_data.action = actions[0][1]
    exported_rig.animation_data.action_slot = actions[0][1].slots[0]
    scene.frame_start = 1
    scene.frame_end = max(round(action.frame_range[1]) for _, action in actions)
    scene.frame_set(1)
    body.select_set(True)
    if output.suffix.lower() == '.fbx':
        bpy.ops.export_scene.fbx(
            filepath=str(output), use_selection=True, object_types={'ARMATURE', 'MESH'},
            add_leaf_bones=False, bake_anim_use_nla_strips=False, bake_anim_use_all_actions=True,
        )
    else:
        bpy.ops.export_scene.gltf(
            filepath=str(output), export_format='GLB', use_selection=True,
            export_animation_mode='ACTIONS', export_anim_single_armature=True,
            export_anim_slide_to_zero=True,
            export_extras=True, export_vertex_color='MATERIAL',
        )
    print('Baked clips:', [(name, action['Nominal ground speed']) for name, action in actions])


export(Path(sys.argv[sys.argv.index('--') + 1]).resolve())
