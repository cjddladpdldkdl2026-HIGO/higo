using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

public static class StlTool
{
    public static float[] Pos;   // welded vertex positions (x,y,z)
    public static int[] Idx;     // triangle indices

    // Load several STLs into one welded mesh; returns each part's centroid.
    public static string LoadMany(string[] paths)
    {
        var allPos = new List<float>(); var allIdx = new List<int>();
        var sb = new System.Text.StringBuilder();
        foreach (var p in paths)
        {
            Load(p);
            int off = allPos.Count / 3;
            double cx = 0, cy = 0, cz = 0; int nv = Pos.Length / 3;
            for (int i = 0; i < nv; i++) { cx += Pos[i * 3]; cy += Pos[i * 3 + 1]; cz += Pos[i * 3 + 2]; }
            sb.AppendFormat("{0} {1:F1},{2:F1},{3:F1}\n", Path.GetFileNameWithoutExtension(p), cx / nv, cy / nv, cz / nv);
            allPos.AddRange(Pos);
            foreach (var i in Idx) allIdx.Add(i + off);
        }
        Pos = allPos.ToArray(); Idx = allIdx.ToArray();
        float[] mn = { 1e9f, 1e9f, 1e9f }, mx = { -1e9f, -1e9f, -1e9f };
        for (int i = 0; i < Pos.Length; i++) { int a = i % 3; mn[a] = Math.Min(mn[a], Pos[i]); mx[a] = Math.Max(mx[a], Pos[i]); }
        sb.AppendFormat("verts={0} tris={1} x[{2:F1},{3:F1}] y[{4:F1},{5:F1}] z[{6:F1},{7:F1}]", Pos.Length / 3, Idx.Length / 3, mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]);
        return sb.ToString();
    }

    public static string Load(string path)
    {
        var data = File.ReadAllBytes(path);
        int n = BitConverter.ToInt32(data, 80);
        var map = new Dictionary<long, int>();
        var pos = new List<float>();
        var idx = new List<int>(n * 3);
        int o = 84;
        for (int t = 0; t < n; t++)
        {
            o += 12; // normal
            for (int v = 0; v < 3; v++)
            {
                float x = BitConverter.ToSingle(data, o), y = BitConverter.ToSingle(data, o + 4), z = BitConverter.ToSingle(data, o + 8);
                o += 12;
                long key = ((long)Math.Round(x * 100) & 0x1FFFFF) | (((long)Math.Round(y * 100) & 0x1FFFFF) << 21) | (((long)Math.Round(z * 100) & 0x1FFFFF) << 42);
                int id;
                if (!map.TryGetValue(key, out id)) { id = pos.Count / 3; map[key] = id; pos.Add(x); pos.Add(y); pos.Add(z); }
                idx.Add(id);
            }
            o += 2;
        }
        Pos = pos.ToArray(); Idx = idx.ToArray();
        float[] mn = { 1e9f, 1e9f, 1e9f }, mx = { -1e9f, -1e9f, -1e9f };
        for (int i = 0; i < Pos.Length; i++) { int a = i % 3; mn[a] = Math.Min(mn[a], Pos[i]); mx[a] = Math.Max(mx[a], Pos[i]); }
        return string.Format("tris={0} verts={1} x[{2:F1},{3:F1}] y[{4:F1},{5:F1}] z[{6:F1},{7:F1}]", n, Pos.Length / 3, mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]);
    }

    // Render an orthographic view with flat shading + z-buffer.
    // axes: horizontal axis h, vertical axis v (screen up), depth axis d; signs flip each.
    public static void Render(string outPath, int h, float hs, int v, float vs, int d, float ds, float[] marks, string[] labels)
    {
        int W = 700, H = 700;
        float[] mn = { 1e9f, 1e9f, 1e9f }, mx = { -1e9f, -1e9f, -1e9f };
        for (int i = 0; i < Pos.Length; i++) { int a = i % 3; mn[a] = Math.Min(mn[a], Pos[i]); mx[a] = Math.Max(mx[a], Pos[i]); }
        float span = 0; for (int a = 0; a < 3; a++) span = Math.Max(span, mx[a] - mn[a]);
        float sc = (W - 80) / span;
        float ch = (mn[h] + mx[h]) / 2, cv = (mn[v] + mx[v]) / 2;
        Func<float[], float[]> P = p => new float[] { W / 2 + (p[h] - ch) * hs * sc, H / 2 - (p[v] - cv) * vs * sc, p[d] * ds };
        var zb = new float[W * H]; for (int i = 0; i < zb.Length; i++) zb[i] = -1e9f;
        var col = new int[W * H]; for (int i = 0; i < col.Length; i++) col[i] = unchecked((int)0xFF101828);
        for (int t = 0; t < Idx.Length; t += 3)
        {
            var a = Get(Idx[t]); var b = Get(Idx[t + 1]); var c = Get(Idx[t + 2]);
            // normal for shading (in world), light from viewer
            float ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
            float[] nrm = { uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx };
            float len = (float)Math.Sqrt(nrm[0] * nrm[0] + nrm[1] * nrm[1] + nrm[2] * nrm[2]) + 1e-9f;
            float shade = Math.Abs(nrm[d] * ds / len) * 0.75f + 0.2f;
            var A = P(a); var B = P(b); var C = P(c);
            int x0 = (int)Math.Max(0, Math.Floor(Math.Min(A[0], Math.Min(B[0], C[0])))), x1 = (int)Math.Min(W - 1, Math.Ceiling(Math.Max(A[0], Math.Max(B[0], C[0]))));
            int y0 = (int)Math.Max(0, Math.Floor(Math.Min(A[1], Math.Min(B[1], C[1])))), y1 = (int)Math.Min(H - 1, Math.Ceiling(Math.Max(A[1], Math.Max(B[1], C[1]))));
            float area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
            if (Math.Abs(area) < 1e-6) continue;
            for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++)
            {
                float w0 = ((B[0] - x) * (C[1] - y) - (B[1] - y) * (C[0] - x)) / area;
                float w1 = ((C[0] - x) * (A[1] - y) - (C[1] - y) * (A[0] - x)) / area;
                float w2 = 1 - w0 - w1;
                if (w0 < 0 || w1 < 0 || w2 < 0) continue;
                float z = w0 * A[2] + w1 * B[2] + w2 * C[2];
                int k = y * W + x;
                if (z > zb[k]) { zb[k] = z; int g = (int)(Math.Min(1, shade) * 235); col[k] = unchecked((int)(0xFF000000 | (uint)(g << 16) | (uint)((int)(g * 0.95) << 8) | (uint)(int)(g * 0.85))); }
            }
        }
        using (var bmp = new Bitmap(W, H))
        {
            var bd = bmp.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            System.Runtime.InteropServices.Marshal.Copy(col, 0, bd.Scan0, col.Length);
            bmp.UnlockBits(bd);
            using (var g = Graphics.FromImage(bmp))
            {
                var f = new Font("Arial", 9);
                // axis ticks every 10 units
                for (float val = (float)Math.Floor(mn[h] / 10) * 10; val <= mx[h]; val += 10) { float x = W / 2 + (val - ch) * hs * sc; g.DrawLine(Pens.DimGray, x, H - 14, x, H); g.DrawString(val.ToString("F0"), f, Brushes.Gray, x - 10, H - 28); }
                for (float val = (float)Math.Floor(mn[v] / 10) * 10; val <= mx[v]; val += 10) { float y = H / 2 - (val - cv) * vs * sc; g.DrawLine(Pens.DimGray, 0, y, 14, y); g.DrawString(val.ToString("F0"), f, Brushes.Gray, 16, y - 6); }
                if (marks != null)
                    for (int i = 0; i < marks.Length / 3; i++)
                    {
                        var p = P(new float[] { marks[i * 3], marks[i * 3 + 1], marks[i * 3 + 2] });
                        g.FillEllipse(Brushes.DeepPink, p[0] - 4, p[1] - 4, 8, 8);
                        g.DrawString(labels[i], new Font("Arial", 10, FontStyle.Bold), Brushes.DeepPink, p[0] + 6, p[1] - 14);
                    }
            }
            bmp.Save(outPath, ImageFormat.Png);
        }
    }

    static float[] Get(int i) { return new float[] { Pos[i * 3], Pos[i * 3 + 1], Pos[i * 3 + 2] }; }

    // Extreme vertex along a direction, optionally restricted to a box.
    public static string Extreme(float dx, float dy, float dz, float[] box)
    {
        float best = -1e9f; int bi = -1;
        for (int i = 0; i < Pos.Length / 3; i++)
        {
            float x = Pos[i * 3], y = Pos[i * 3 + 1], z = Pos[i * 3 + 2];
            if (box != null && (x < box[0] || x > box[1] || y < box[2] || y > box[3] || z < box[4] || z > box[5])) continue;
            float s = x * dx + y * dy + z * dz;
            if (s > best) { best = s; bi = i; }
        }
        return bi < 0 ? "none" : string.Format("{0:F1},{1:F1},{2:F1}", Pos[bi * 3], Pos[bi * 3 + 1], Pos[bi * 3 + 2]);
    }

    // Nearest vertex to a point → snapped surface position.
    public static string Snap(float x, float y, float z)
    {
        float best = 1e18f; int bi = 0;
        for (int i = 0; i < Pos.Length / 3; i++)
        {
            float a = Pos[i * 3] - x, b = Pos[i * 3 + 1] - y, c = Pos[i * 3 + 2] - z;
            float d = a * a + b * b + c * c; if (d < best) { best = d; bi = i; }
        }
        return string.Format("{0:F1},{1:F1},{2:F1} (dist {3:F1})", Pos[bi * 3], Pos[bi * 3 + 1], Pos[bi * 3 + 2], Math.Sqrt(best));
    }

    // Compact indexed mesh: header [nVerts, nIdx] (uint32) + float32 positions + uint32 indices.
    public static void WriteBin(string path)
    {
        using (var w = new BinaryWriter(File.Create(path)))
        {
            w.Write((uint)(Pos.Length / 3)); w.Write((uint)Idx.Length);
            foreach (var f in Pos) w.Write(f);
            foreach (var i in Idx) w.Write((ushort)i);
        }
    }
}
