process.loadEnvFile();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const app = express();
const PORT = 3000;

// ==================== MIDDLEWARE ====================
// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // Enable JSON parsing if needed

// ==================== CONSTANTS ====================
const DEFAULT_USERNAME = process.env.SMARTBOX_USERNAME;
const DEFAULT_PASSWORD = process.env.SMARTBOX_DEFAULT_PASSWORD;
const SMARTBOX_CONFIG_FILE = './smartbox.json';

// ==================== HELPER FUNCTIONS ====================

async function getEdgeDeviceID(ip_address) {
  try {
    const response = await fetch(`http://${ip_address}:8001/api/v1/edge-devices/get-edgedevice`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!response.ok) {
      const data = {
        success: false,
        message: "device offline or unreachaable"
      }
      return data
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Failed to get edge device ID for ${ip_address}:`, error.message);
    throw error;
  }
}


async function getAccessTokenByIP(ip_address) {

  const raw_data = await fs.readFile(SMARTBOX_CONFIG_FILE, 'utf8');
  const data_smartbox = JSON.parse(raw_data);
  const index = data_smartbox.findIndex(data => data.ip === ip_address);
  
  if (index === -1) {
      throw new Error(`Location "${ip_address}" not found`);
  }
  
  const password = data_smartbox[index].password;

  const params = new URLSearchParams({
    username: DEFAULT_USERNAME,
    password: password,
  });

  try {
    const response = await fetch(`http://${ip_address}:8001/auth/token`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (!response.ok) {
      const data = {
        success: false,
        message: "device offline or unreachaable"
      }
      return data
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Failed to get access token for ${ip_address}:`, error.message);
    throw error;
  }
}


async function getAccessTokenByLocation(location) {
    try {
        const raw_data = await fs.readFile(SMARTBOX_CONFIG_FILE, 'utf8');
        const data_smartbox = JSON.parse(raw_data);
        const index = data_smartbox.findIndex(data => data.name === location);
        
        if (index === -1) {
            throw new Error(`Location "${location}" not found`);
        }
        
        const ip_address = data_smartbox[index].ip;
        const device_id = await getEdgeDeviceID(ip_address);
        const tokenData = await getAccessTokenByIP(ip_address);
        tokenData.ip = ip_address
        tokenData.device_id = device_id.edge_id;
        return tokenData;
    } catch (error) {
        console.error('Failed to get access token by location:', error.message);
        throw error;
    }
}


async function getAlertCount(ip_address, edge_id, token) {
  try {
    const response = await fetch(`http://${ip_address}:8001/api/v1/detection/${edge_id}/camera-alert-counts`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const data = {
        success: false,
        message: "device offline or unreachaable"
      }
      return data
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Failed to get alert counts for ${edge_id}:`, error.message);
    return null; // Return null instead of throwing to handle gracefully
  }
}


async function getAlertsLastWeek(ip_address) {

    const device_id = await getEdgeDeviceID(ip_address)
    const tokenData = await getAccessTokenByIP(ip_address);
    // Get today's date
    const date_to = new Date();
    
    // Get date from 7 days ago
    const date_from = new Date();
    date_from.setDate(date_to.getDate() - 7);
    
    // Format dates as YYYY-MM-DD
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    const url = `http://${ip_address}:8001/api/v1/detection/${device_id.edge_id}/alerts/advanced-filter?date_from=${formatDate(date_from)}&date_to=${formatDate(date_to)}&start_row=1&end_row=100`;
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${tokenData.access_token}`
            }
        });
        
      if (!response.ok) {
        const data = {
          success: false,
          message: "device offline or unreachaable"
        }
        return data
      }
        
      const data = await response.json();

      const result = []
      data.data.forEach(item => {
        if (item.is_active) {
          const filename = item.core_url.split('/').pop();
          result.push({
            id: item.id,
            edge_id: device_id.edge_id,
            camera_name: item.camera_name,
            camera_id: item.camera_id,
            confidence: item.confidence,
            url: `http://${ip_address}:8001/api/v1/detection/frames/${item.camera_id}/${filename}`,
            event_type: item.event_type,
            event_message: item.event_message,
            event_time: item.event_time
          })
        }
      });

      return {
        success: true,
        data: result
      };
        
    } catch (error) {
        const data = {
          success: false,
          message: "device offline or unreachaable"
        }
        return data
    }
}


async function loadSmartboxConfig() {
    try {
        const raw_data = await fs.readFile(SMARTBOX_CONFIG_FILE, 'utf8');
        return JSON.parse(raw_data);
    } catch (error) {
        console.error('Failed to load smartbox config:', error.message);
        throw error;
    }
}

// ==================== API ENDPOINTS ====================

app.get('/all_credentials', async (req, res) => {
    try {
        const data_smartbox = await loadSmartboxConfig();
        const FETCH_TIMEOUT = 20000; // 5 seconds
        
        // Process all devices in parallel with Promise.allSettled
        const promises = data_smartbox.map(async (device, index) => {
            const { ip: ip_address, name } = device;
            
            try {
                // Create timeout promise
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Request timeout')), FETCH_TIMEOUT);
                });
                
                // Race between actual request and timeout
                const deviceData = await Promise.race([
                    getEdgeDeviceID(ip_address),
                    timeoutPromise
                ]);
                
                const device_id = deviceData.edge_id;
                
                const tokenData = await Promise.race([
                    getAccessTokenByIP(ip_address),
                    timeoutPromise
                ]);
                
                const alertCounts = await Promise.race([
                    getAlertCount(ip_address, device_id, tokenData.access_token),
                    timeoutPromise
                ]);
                
                return {
                    no: index,
                    name: name,
                    ip: ip_address,
                    status: "online",
                    device_id: device_id,
                    access_token: tokenData.access_token,
                    token_type: tokenData.token_type,
                    alert: alertCounts
                };
                
            } catch (error) {
                const isTimeout = error.message === 'Request timeout';
                return {
                    no: index,
                    name: name,
                    ip: ip_address,
                    status: isTimeout ? "timeout" : "offline",
                    device_id: "",
                    access_token: "",
                    token_type: "",
                    alert: null,
                    error: isTimeout ? "Connection timeout" : error.message
                };
            }
        });
        
        // Wait for all promises to settle (complete or fail)
        const result = await Promise.all(promises);
        const now = new Date();
        
        res.json({
            success: true,
            last_updated: now.toLocaleString(),
            count: result.length,
            online_count: result.filter(d => d.status === "online").length,
            offline_count: result.filter(d => d.status === "offline").length,
            timeout_count: result.filter(d => d.status === "timeout").length,
            devices: result
        });
        
    } catch (error) {
        console.error('Error in /all_credentials:', error);
        res.status(500).json({ 
            success: false,
            message: "Internal server error",
            error: error.message 
        });
    }
});



/**
 * Get alert counts for a specific device
 * GET /alerts/:location
 */
app.get('/alerts/:location', async (req, res) => {
    try {
        const { location } = req.params;
        const tokenData = await getAccessTokenByLocation(location);
        
        if (!tokenData || !tokenData.access_token) {
            return res.status(401).json({
                success: false,
                message: "Failed to get access token"
            });
        }
        
        const alertCounts = await getAlertCount(
            tokenData.ip || req.body.ip,
            tokenData.device_id,
            tokenData.access_token
        );
        
        res.json({
            success: true,
            location: location,
            device_id: tokenData.device_id,
            alerts: alertCounts
        });
        
    } catch (error) {
        console.error('Error in /alerts/:location:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Health check endpoint
 * GET /health
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});


app.get('/lastweek/:name', async (req, res) => {
  const { name } = req.params;
  const data_smartbox = await loadSmartboxConfig();

  const index = data_smartbox.findIndex(data => data.name === name);

  if (index === -1) {
    res.json({
      success: false,
      message: "smartbox not found"
    });
  } else {
    const data = await getAlertsLastWeek(data_smartbox[index].ip);
    res.json(data);
  }
});

// ==================== ERROR HANDLING ====================

// 404 handler for undefined routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.url} not found`
    });
});

// // Global error handler
// app.use((err, req, res, next) => {
//     console.error('Unhandled error:', err);
//     res.status(500).json({
//         success: false,
//         message: "Internal server error",
//         error: process.env.NODE_ENV === 'development' ? err.message : undefined
//     });
// });

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});