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
    const combinedUrls = input
      .filter(visual => visual.uploaded_image_url)
      .map(visual => visual.uploaded_image_url);

    res.json({
      scene_number: scene_number,
      combined_image_urls: combinedUrls
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
