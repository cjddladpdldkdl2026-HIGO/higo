# tools/StlTool.cs — BodyParts3D STL → game mesh

Windows PowerShell helper (no Python/Node needed) used to build `assets/*.bin`
and to find landmark coordinates.

```powershell
Add-Type -Path tools\StlTool.cs -ReferencedAssemblies System.Drawing
[StlTool]::Load("FMA13395.stl")                       # one bone; prints bounds
[StlTool]::LoadMany(@("FMA16586.stl","FMA16587.stl"))  # several bones; prints each centroid
[StlTool]::Render("view.png", 0, 1, 2, 1, 1, -1, $null, $null)  # true anterior view
[StlTool]::Render("view.png", 0, -1, 2, 1, 1, 1, $marks, $labels) # true posterior view + marks
[StlTool]::Extreme(-1, 0, 0, @(xmin,xmax,ymin,ymax,zmin,zmax))  # extreme vertex along a direction in a box
[StlTool]::Snap(x, y, z)                              # nearest vertex
[StlTool]::WriteBin("assets\bone.bin")                # header [nVerts,nIdx] u32 + f32 xyz + u16 idx
```

Render args: horizontal axis, its sign, vertical axis, its sign, depth axis,
its sign (axes 0=x 1=y 2=z). Mesh axes: −x = patient's right, +y = posterior,
+z = superior. Indices are uint16, so a mesh must stay under 65,536 vertices.
