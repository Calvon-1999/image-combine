const express = require('express');
const sharp = require('sharp');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

// Helper function to download image
async function downloadImage(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data);
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Scene Image URL Combiner API',
    endpoints: {
      '/combine': 'POST - Combine image URLs from scenes',
      '/health': 'GET - Health check'
    },
    usage: {
      method: 'POST',
      url: '/combine',
      body: 'Array of scene objects with visuals'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Main endpoint to combine image URLs
app.post('/combine', async (req, res) => {
  try {
    const { scene_number, input } = req.body;

    // Validate input
    if (!scene_number) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'scene_number is required'
      });
    }

    if (!Array.isArray(input)) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'input must be an array of visuals'
      });
    }

    // Extract all image URLs from the input array
    const imageUrls = input
      .filter(visual => visual.uploaded_image_url)
      .map(visual => visual.uploaded_image_url);

    // If only 1 image, return it as is
    if (imageUrls.length === 1) {
      return res.json({
        scene_number: scene_number,
        combined_image_url: imageUrls[0],
        original_count: 1
      });
    }

    // If more than 1 image, merge them
    if (imageUrls.length > 1) {
      console.log(`Merging ${imageUrls.length} images for scene ${scene_number}`);
      
      // Download all images
      const imageBuffers = await Promise.all(
        imageUrls.map(url => downloadImage(url))
      );

      // Get metadata for all images
      const imageMetadata = await Promise.all(
        imageBuffers.map(buffer => sharp(buffer).metadata())
      );

      // Calculate combined image dimensions (horizontal layout for 16:9)
      const totalWidth = imageMetadata.reduce((sum, meta) => sum + meta.width, 0);
      const maxHeight = Math.max(...imageMetadata.map(meta => meta.height));

      // Create composite array for sharp
      let xOffset = 0;
      const compositeImages = await Promise.all(
        imageBuffers.map(async (buffer, index) => {
          const meta = imageMetadata[index];
          const resizedBuffer = await sharp(buffer)
            .resize(meta.width, maxHeight, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
            .toBuffer();
          
          const composite = {
            input: resizedBuffer,
            left: xOffset,
            top: 0
          };
          
          xOffset += meta.width;
          return composite;
        })
      );

      // Create the combined image
      const combinedImageBuffer = await sharp({
        create: {
          width: totalWidth,
          height: maxHeight,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
      })
      .composite(compositeImages)
      .png()
      .toBuffer();

      // Return as binary data
      res.set({
        'Content-Type': 'image/png',
        'Content-Length': combinedImageBuffer.length,
        'Content-Disposition': `attachment; filename="scene_${scene_number}_combined.png"`
      });
      
      return res.send(combinedImageBuffer);
    }

    // No images found
    res.json({
      scene_number: scene_number,
      combined_image_url: null,
      original_count: 0,
      message: 'No images found to combine'
    });

  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({
      error: 'Processing error',
      message: error.message
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
