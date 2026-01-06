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

    // If only 1 image, fit it into 9:16 canvas
    if (imageUrls.length === 1) {
      console.log(`Fitting single image into 9:16 canvas for scene ${scene_number}`);
      
      // Fixed 9:16 aspect ratio dimensions (portrait)
      const canvasWidth = 1080;
      const canvasHeight = 1920;
      
      // Download the image
      const imageBuffer = await downloadImage(imageUrls[0]);
      
      // Get image metadata
      const meta = await sharp(imageBuffer).metadata();
      
      // Calculate scaling to fit within canvas while maintaining aspect ratio
      const widthScale = canvasWidth / meta.width;
      const heightScale = canvasHeight / meta.height;
      const scale = Math.min(widthScale, heightScale);
      
      const newWidth = Math.floor(meta.width * scale);
      const newHeight = Math.floor(meta.height * scale);
      
      // Resize image to fit
      const resizedBuffer = await sharp(imageBuffer)
        .resize(newWidth, newHeight, { 
          fit: 'contain', 
          background: { r: 255, g: 255, b: 255, alpha: 0 } 
        })
        .toBuffer();
      
      // Center the image on canvas
      const xOffset = Math.floor((canvasWidth - newWidth) / 2);
      const yOffset = Math.floor((canvasHeight - newHeight) / 2);
      
      // Create the final image with 9:16 aspect ratio
      const combinedImageBuffer = await sharp({
        create: {
          width: canvasWidth,
          height: canvasHeight,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
      })
      .composite([{
        input: resizedBuffer,
        left: xOffset,
        top: yOffset
      }])
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

    // If more than 1 image, merge them
    if (imageUrls.length > 1) {
      console.log(`Merging ${imageUrls.length} images for scene ${scene_number}`);
      
      // Fixed 9:16 aspect ratio dimensions (portrait)
      const canvasWidth = 1080;
      const canvasHeight = 1920;
      const padding = 20; // Padding between images
      
      // Download all images
      const imageBuffers = await Promise.all(
        imageUrls.map(url => downloadImage(url))
      );

      // Get metadata for all images
      const imageMetadata = await Promise.all(
        imageBuffers.map(buffer => sharp(buffer).metadata())
      );

      // Calculate available space for images (accounting for padding)
      const availableHeight = canvasHeight - (padding * (imageUrls.length + 1));
      const heightPerImage = Math.floor(availableHeight / imageUrls.length);

      // Create composite array for sharp (vertical stacking)
      let yOffset = padding;
      const compositeImages = await Promise.all(
        imageBuffers.map(async (buffer, index) => {
          const meta = imageMetadata[index];
          
          // Calculate scaling to fit within canvas width and allocated height
          const widthScale = (canvasWidth - 2 * padding) / meta.width;
          const heightScale = heightPerImage / meta.height;
          const scale = Math.min(widthScale, heightScale);
          
          const newWidth = Math.floor(meta.width * scale);
          const newHeight = Math.floor(meta.height * scale);
          
          // Resize image to fit
          const resizedBuffer = await sharp(buffer)
            .resize(newWidth, newHeight, { 
              fit: 'contain', 
              background: { r: 255, g: 255, b: 255, alpha: 0 } 
            })
            .toBuffer();
          
          // Center horizontally
          const xOffset = Math.floor((canvasWidth - newWidth) / 2);
          
          const composite = {
            input: resizedBuffer,
            left: xOffset,
            top: yOffset
          };
          
          yOffset += newHeight + padding;
          return composite;
        })
      );

      // Create the combined image with 9:16 aspect ratio
      const combinedImageBuffer = await sharp({
        create: {
          width: canvasWidth,
          height: canvasHeight,
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
