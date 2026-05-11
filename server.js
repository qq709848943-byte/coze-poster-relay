const express = require("express");
const axios = require("axios");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 3000;

const generatedDir = path.join(__dirname, "generated");
if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true });
}

app.use("/generated", express.static(generatedDir));

async function downloadImageBuffer(imageUrl) {
  const resp = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 30000
  });
  return Buffer.from(resp.data);
}

function svgText(text, options = {}) {
  const {
    width = 800,
    height = 100,
    fontSize = 48,
    color = "#222222",
    fontWeight = "700",
    align = "left"
  } = options;

  const x = align === "center" ? "50%" : "0";
  const anchor = align === "center" ? "middle" : "start";

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .t {
          fill: ${color};
          font-size: ${fontSize}px;
          font-weight: ${fontWeight};
          font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", Arial, sans-serif;
        }
      </style>
      <text x="${x}" y="${fontSize}" text-anchor="${anchor}" class="t">${text}</text>
    </svg>
  `);
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "coze poster relay is running"
  });
});

/**
 * 轻盈卖点图
 * 输入:
 * {
 *   "product_image": "https://xxx.jpg",
 *   "title": "约9g轻盈",
 *   "subtitle": "纯钛材质 轻盈不压鼻",
 *   "badge": "PURE TITANIUM"
 * }
 */
app.post("/compose/lightweight", async (req, res) => {
  try {
    const {
      product_image,
      title = "约9g轻盈",
      subtitle = "纯钛材质 轻盈不压鼻",
      badge = "PURE TITANIUM"
    } = req.body || {};

    if (!product_image) {
      return res.status(400).json({
        ok: false,
        error: "product_image is required"
      });
    }

    // 下载产品图
    const productBuffer = await downloadImageBuffer(product_image);

    // 处理产品图：contain，不裁切，不拉伸
    const resizedProduct = await sharp(productBuffer)
      .resize({
        width: 720,
        height: 500,
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();

    // 画布
    const canvasWidth = 1024;
    const canvasHeight = 1024;

    // 简单高级浅米色背景
    const background = await sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 4,
        background: { r: 245, g: 239, b: 232, alpha: 1 }
      }
    })
      .png()
      .toBuffer();

    // 装饰线
    const lineSvg = Buffer.from(`
      <svg width="200" height="4" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="4" fill="#c7b8a3" />
      </svg>
    `);

    const titleSvg = svgText(title, {
      width: 420,
      height: 90,
      fontSize: 62,
      color: "#2a2a2a",
      fontWeight: "700"
    });

    const subtitleSvg = svgText(subtitle, {
      width: 420,
      height: 70,
      fontSize: 28,
      color: "#666666",
      fontWeight: "400"
    });

    const badgeSvg = svgText(badge, {
      width: 420,
      height: 50,
      fontSize: 22,
      color: "#9f8b74",
      fontWeight: "600"
    });

    // 合成
    const finalBuffer = await sharp(background)
      .composite([
        { input: badgeSvg, top: 90, left: 90 },
        { input: titleSvg, top: 150, left: 90 },
        { input: subtitleSvg, top: 245, left: 90 },
        { input: lineSvg, top: 315, left: 90 },
        { input: resizedProduct, top: 380, left: 160 }
      ])
      .png()
      .toBuffer();

    // 保存文件
    const filename = `${uuidv4()}.png`;
    const filePath = path.join(generatedDir, filename);
    fs.writeFileSync(filePath, finalBuffer);

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const url = `${baseUrl}/generated/${filename}`;

    return res.json({
      ok: true,
      url
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "compose failed"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
