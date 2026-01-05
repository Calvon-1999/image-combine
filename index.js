const express = require('express');
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
app.post('/combine', (req, res) => {
  try {
    const scenes = req.body;

    // Validate input
    if (!Array.isArray(scenes)) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Expected an array of scene objects'
      });
    }

    // Process scenes and combine image URLs
    const result = scenes.map(scene => {
      const sceneNumber = scene.scene_number;
      const imageUrls = [];

      if (scene.visuals && Array.isArray(scene.visuals)) {
        scene.visuals.forEach(visual => {
          if (visual.uploaded_image_url) {
            imageUrls.push({
              type: visual.type,
              name: visual.name,
              url: visual.uploaded_image_url
            });
          }
        });
      }

      return {
        scene_number: sceneNumber,
        image_count: imageUrls.length,
        images: imageUrls,
        all_urls: imageUrls.map(img => img.url)
      };
    });

    // Sort by scene number
    result.sort((a, b) => a.scene_number - b.scene_number);

    res.json({
      success: true,
      total_scenes: result.length,
      scenes: result
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
