import bpy
from mathutils import Vector
from pathlib import Path
import sys

output = Path(sys.argv[sys.argv.index('--')+1]).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
groups = list(scene.collection.children)
character = [o for group in groups if group.name[:2] in ('01','02','03','04','05') for o in group.objects]
def select(objects, active):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active = active

# Bake the curve and bevel modifiers to meshes for glTF.
part_types = {}
for original in character:
    collection_code = original.users_collection[0].name[:2]
    part = original.name
    select([original], original)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    side = 'L' if '-1' in part else 'R'
    if collection_code in ('01','02'):
        category = 'head'
    elif collection_code == '04' and part != 'Denim seat':
        category = ('leg' if part.startswith(('Denim leg','Outer leg')) else 'foot')+side
    elif part.startswith(('Tailored sleeve','Sleeve cuff','Palm','Thumb','Curled finger')):
        category = ('sleeve' if part.startswith('Tailored') else 'hand')+side
    else:
        category = 'torso'
    part_types[obj] = category

armature = bpy.data.armatures.new('Link skeleton')
rig = bpy.data.objects.new('Link skeleton', armature)
scene.collection.objects.link(rig)
select([rig], rig)
bpy.ops.object.mode_set(mode='EDIT')
def bone(name, start, end, parent=None):
    result = armature.edit_bones.new(name)
    result.head = start
    result.tail = end
    if parent: result.parent = armature.edit_bones[parent]
    return result

# Leave the joints named consistently for the walk cycle in the browser.
bone('Hips',(0,.02,1.29),(0,.02,1.55))
bone('Chest',(0,.02,1.55),(0,.015,2.13),'Hips')
bone('Head',(0,0,2.18),(0,0,2.86),'Chest')
for sign, side in ((-1,'L'),(1,'R')):
    x = lambda a: sign*a
    bone('Thigh'+side,(x(.167),.036,1.346),(x(.207),0,.891),'Hips')
    bone('Shin'+side,(x(.207),0,.891),(x(.243),0,.272),'Thigh'+side)
    bone('Foot'+side,(x(.243),0,.272),(x(.247),-.23,.145),'Shin'+side)
    bone('UpperArm'+side,(x(.383),.02,2.032),(x(.510),.035,1.781),'Chest')
    bone('Forearm'+side,(x(.510),.035,1.781),(x(.600),.035,1.422),'UpperArm'+side)
bpy.ops.object.mode_set(mode='OBJECT')

def smooth(a,b,value):
    t = max(0,min(1,(value-a)/(b-a)))
    return t*t*(3-2*t)

objects = []
for obj, category in part_types.items():
    side = category[-1]
    weights = {}
    for v in obj.data.vertices:
        x,y,z = v.co
        if category.startswith(('leg','foot')):
            stride = -.15 if side=='L' else .19
            influence = 1 if category.startswith('foot') else smooth(1.32,.27,z)
            v.co.y -= stride*influence
        elif category.startswith(('sleeve','hand')):
            lift = .14 if side=='L' else -.063
            v.co.y -= lift * (1 if category.startswith('hand') else smooth(2.045,1.46,z))
        if category == 'head':
            pair = [('Head',1)]
        elif category.startswith('leg'):
            knee = smooth(.77,1.01,z)
            pelvis = smooth(1.27,1.42,z)
            pair = [('Shin'+side,1-knee),('Thigh'+side,knee*(1-pelvis)),('Hips',pelvis*knee)]
        elif category.startswith('foot'):
            ankle = smooth(.20,.37,z)
            pair = [('Shin'+side,ankle),('Foot'+side,1-ankle)]
        elif category.startswith('sleeve'):
            elbow = smooth(1.64,1.91,z)
            pair = [('Forearm'+side,1-elbow),('UpperArm'+side,elbow)]
        elif category.startswith('hand'):
            pair = [('Forearm'+side,1)]
        else:
            chest = smooth(1.38,1.85,z)
            pair = [('Chest',chest),('Hips',1-chest)]
        for name,value in pair:
            if value>.0001: weights.setdefault(name,[]).append((v.index,value))
    for name, entries in weights.items():
        vg = obj.vertex_groups.new(name=name)
        rigid = [i for i,w in entries if w == 1]
        if rigid: vg.add(rigid,1,'REPLACE')
        for i,w in entries:
            if w < 1: vg.add([i],w,'REPLACE')
    # Procedural Blender fabric nodes cannot travel as glTF shaders. Export their
    # material colors with the source surface roughness.
    for mat in obj.data.materials:
        if not mat or not mat.use_nodes: continue
        bs = mat.node_tree.nodes.get('Principled BSDF')
        for link in list(bs.inputs['Normal'].links):
            mat.node_tree.links.remove(link)
        for link in list(bs.inputs['Base Color'].links):
            if link.from_node.type != 'VERTEX_COLOR':
                mat.node_tree.links.remove(link)
                bs.inputs['Base Color'].default_value = mat.diffuse_color
    objects.append(obj)

# Join material-compatible parts to reduce skin bindings and draw calls.
select(objects, objects[0])
bpy.ops.object.join()
body = bpy.context.object
body.name = 'Young Link'
body.parent = rig
mod = body.modifiers.new('Link deformation', 'ARMATURE')
mod.object = rig
select([body, rig], rig)
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB',
    use_selection=True, export_animations=False, export_vertex_color='MATERIAL')

