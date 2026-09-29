let slideIndex = 1;

async function urlToBlobUrl(imageUrl) {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) {
            throw new Error('URL does not point to a valid image');
        }
        const blobUrl = URL.createObjectURL(blob);
        return blobUrl;
    } catch (error) {
        console.error('Error converting URL to blob:', error.message);
        return null;
    }
}

async function downloadImage(url, customFileName) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) {
            throw new Error('The URL does not point to a valid image');
        }
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        
        let finalFileName = customFileName;
        const extension = blob.type.split('/')[1];
        if (!finalFileName.toLowerCase().endsWith(`.${extension}`)) {
            finalFileName = `${finalFileName}.${extension}`;
        }
        link.download = finalFileName;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        
        console.log(`Image downloaded successfully as: ${finalFileName}`);
        return true;
    } catch (error) {
        console.error('Error downloading image:', error.message);
        return false;
    }
}

async function getAlerts(name) {
    $(".alert-title").hide();
    $(".alert-container").show();
    $("#alert-results").html("");
    $("#dots").html("");
    $("#loading-alerts").html(`<p class="loading-alert">Loading...</p>`);

    let slides = "";
    let dots = "";

    try {
        const response = await fetch(`https://alert.core9.id/lastweek/${name}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (data.success) {
            const length = data.data.length;
            
            for (let i = 0; i < data.data.length; i++) {
                const item = data.data[i];
                const blobUrl = await urlToBlobUrl(item.url);
                
                slides += `<div class="mySlides fade magnifier-container">
                    <div class="numbertext">${i+1} / ${length}</div>
                    <div style="background-color: #0a0a0a; min-height: 88vh; display: flex; align-items: center; justify-content: center; position: relative;">
                        <img src="${blobUrl || item.url}"
                            class="magnifier-image" 
                            style="width:100%; display: block;" 
                            referrerpolicy="no-referrer" 
                            loading="lazy"
                            data-original-url="${item.url}"
                            onload="this.style.opacity='1'; this.parentElement.querySelector('.loading-text').style.display='none'; setupMagnifierForSlide(this);"
                            onerror="this.style.display='none'; this.parentElement.querySelector('.loading-text').textContent='❌ Failed to load';">
                        <div class="magnifier-glass" style="display: none;"></div>
                        <div class="loading-text" style="position: absolute; color: #666;">Loading image...</div>
                    </div>
                    <div class="text"><p>ID ${item.id} | ${item.camera_name} | ${item.event_type} <span class="download" onclick='downloadImage("${item.url}", "ID-${item.id}-${item.event_type}")'>Download</span></p></div>
                </div>`;

                dots += `<span class="dot" onclick="currentSlide(${i+1})"></span>`;
            }

            $("#alert-results").append(slides);
            $("#dots").append(dots);
            $("#loading-alerts").html(`<a class="prev" onclick="plusSlides(-1)">❮</a><a class="next" onclick="plusSlides(1)">❯</a>`);
            $(".alert-title").show();
            showSlides(slideIndex);
        }
    } catch (error) {
        console.log('Request failed:', error);
    }
}

// Setup magnifier for a specific slide image
function setupMagnifierForSlide(imgElement) {
    const container = imgElement.closest('.magnifier-container');
    if (!container) return;
    
    const glass = container.querySelector('.magnifier-glass');
    if (!glass) return;
    
    // Remove existing event listeners to avoid duplicates
    const newGlass = glass.cloneNode(true);
    glass.parentNode.replaceChild(newGlass, glass);
    
    const finalGlass = container.querySelector('.magnifier-glass');
    const finalImg = container.querySelector('.magnifier-image');
    
    let zoom = 2;
    
    function updateMagnifier(e) {
        if (!finalImg.complete || finalImg.naturalWidth === 0) return;
        
        // Get the actual image element position within the container
        const imgRect = finalImg.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Calculate mouse position relative to the image
        const mouseX = e.clientX - imgRect.left;
        const mouseY = e.clientY - imgRect.top;
        
        // Check if cursor is within image bounds
        if (mouseX < 0 || mouseX > imgRect.width || mouseY < 0 || mouseY > imgRect.height) {
            finalGlass.style.display = 'none';
            return;
        }
        
        finalGlass.style.display = 'block';
        
        // Position the magnifier glass relative to the container
        const glassWidth = finalGlass.offsetWidth;
        const glassHeight = finalGlass.offsetHeight;
        
        // Calculate position relative to container
        let glassX = (e.clientX - containerRect.left) - glassWidth / 2;
        let glassY = (e.clientY - containerRect.top) - glassHeight / 2;
        
        // Keep glass within container bounds
        glassX = Math.max(0, Math.min(glassX, containerRect.width - glassWidth));
        glassY = Math.max(0, Math.min(glassY, containerRect.height - glassHeight));
        
        finalGlass.style.left = `${glassX}px`;
        finalGlass.style.top = `${glassY}px`;
        
        // Calculate the position percentage within the image for zoom
        const xPercent = (mouseX / imgRect.width) * 100;
        const yPercent = (mouseY / imgRect.height) * 100;
        
        // Calculate background size based on actual image dimensions
        const bgWidth = finalImg.naturalWidth * zoom;
        const bgHeight = finalImg.naturalHeight * zoom;
        
        finalGlass.style.backgroundImage = `url(${finalImg.src})`;
        finalGlass.style.backgroundSize = `${bgWidth}px ${bgHeight}px`;
        finalGlass.style.backgroundPosition = `${xPercent}% ${yPercent}%`;
        finalGlass.style.backgroundRepeat = 'no-repeat';
    }
    
    function hideMagnifier() {
        finalGlass.style.display = 'none';
    }
    
    // Remove old listeners and add new ones
    container.removeEventListener('mousemove', updateMagnifier);
    container.removeEventListener('mouseleave', hideMagnifier);
    container.addEventListener('mousemove', updateMagnifier);
    container.addEventListener('mouseleave', hideMagnifier);
}

// Setup delegation for dynamically created magnifiers
function setupMagnifierDelegation() {
    const alertResults = document.getElementById('alert-results');
    if (!alertResults) return;
    
    // Observe DOM changes to setup magnifiers for new images
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) { // Element node
                    const images = node.querySelectorAll ? node.querySelectorAll('.magnifier-image') : [];
                    images.forEach(img => {
                        if (img.complete && img.naturalWidth > 0) {
                            setupMagnifierForSlide(img);
                        } else {
                            img.addEventListener('load', function() {
                                setupMagnifierForSlide(this);
                            });
                        }
                    });
                }
            });
        });
    });
    
    observer.observe(alertResults, { childList: true, subtree: true });
}

async function refreshData() {
    $('#loading').show();
    $('#smartbox').html("");
    $("#alert-results").html("");
    $("#dots").html("");
    $("#loading-alerts").html(`<p class="loading-alert">Loading...</p>`);

    try {
        const response = await fetch('https://alert.core9.id/all_credentials');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (data.success) {
            localStorage.setItem('all_data', JSON.stringify(data));
            applyData(data.devices, data.last_updated);
        }
    } catch (error) {
        console.log('Request failed:', error);
    }
}

function applyData(arr, last_updated) {
    let string = "";
    arr.forEach(item => {
        try {
            string += `
                <div onclick="getAlerts('${item.name}')" class="card">
                    <h3>${item.name}</h3>
                    <p>${item.alert.data.total_alerts} Alerts from ${item.alert.data.total_cameras} Cameras</p>
                </div>
            `;
        } catch {
            string += `
                <div class="card">
                    <h3>${item.name}</h3>
                    <p>Offline</p>
                </div>
            `;
        }
        localStorage.setItem(item.name, JSON.stringify(item));
    });
    $('#last_updated').html(last_updated);
    $('#smartbox').append(string);
    $('#loading').hide();
}

async function getAllCredentials() {
    $('#loading').show();
    try {
        const response = await fetch('https://alert.core9.id/all_credentials');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (data.success) {
            localStorage.setItem('all_data', JSON.stringify(data));
            applyData(data.devices, data.last_updated);
        }
    } catch (error) {
        console.log('Request failed:', error);
    }
}

function plusSlides(n) {
    showSlides(slideIndex += n);
}

function currentSlide(n) {
    showSlides(slideIndex = n);
}

function showSlides(n) {
    let i;
    let slides = document.getElementsByClassName("mySlides");
    let dots = document.getElementsByClassName("dot");
    if (n > slides.length) { slideIndex = 1 }
    if (n < 1) { slideIndex = slides.length }
    for (i = 0; i < slides.length; i++) {
        slides[i].style.display = "none";
    }
    for (i = 0; i < dots.length; i++) {
        dots[i].className = dots[i].className.replace(" active", "");
    }
    if (slides[slideIndex - 1]) {
        slides[slideIndex - 1].style.display = "block";
        dots[slideIndex - 1].className += " active";
        
        // Setup magnifier for the current slide's image
        const currentImg = slides[slideIndex - 1].querySelector('.magnifier-image');
        if (currentImg && currentImg.complete) {
            setupMagnifierForSlide(currentImg);
        }
    }
}

// Initialize
const data_local = JSON.parse(localStorage.getItem("all_data"));
if (data_local !== null) {
    applyData(data_local.devices, data_local.last_updated);
} else {
    getAllCredentials();
}

// Setup magnifier delegation when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    setupMagnifierDelegation();
});
