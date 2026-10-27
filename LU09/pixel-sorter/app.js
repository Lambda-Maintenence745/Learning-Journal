const ui = {
    imageInput: document.querySelector("#image-input"),
    preview: document.querySelector("#preview"),
    emptyPreview: document.querySelector("#empty-preview"),
    labelSelect: document.querySelector("#label-select"),
    addButton: document.querySelector("#add-button"),
    trainButton: document.querySelector("#train-button"),
    predictButton: document.querySelector("#predict-button"),
    counts: document.querySelector("#example-counts"),
    status: document.querySelector("#status"),
    result: document.querySelector("#result"),
};

const labels = ["warm colors", "cool colors"];
const examples = [];
let currentFeatures = null;
let currentImageUrl = null;
let network = null;
let isTraining = false;

const setStatus = (message, kind = "info") => {
    ui.status.textContent = message;
    ui.status.dataset.kind = kind;
};

const extractFeatures = (image) => {
    const size = 64;
    const gridSize = 8;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
        throw new Error("This browser could not create a pixel-reading canvas.");
    }

    canvas.width = size;
    canvas.height = size;

    const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
    const cropX = (image.naturalWidth - cropSize) / 2;
    const cropY = (image.naturalHeight - cropSize) / 2;
    context.drawImage(
        image,
        cropX,
        cropY,
        cropSize,
        cropSize,
        0,
        0,
        size,
        size,
    );

    const { data } = context.getImageData(0, 0, size, size);
    const cellSize = size / gridSize;
    const features = [];

    for (let gridY = 0; gridY < gridSize; gridY += 1) {
        for (let gridX = 0; gridX < gridSize; gridX += 1) {
            let red = 0;
            let green = 0;
            let blue = 0;
            let pixels = 0;

            for (let y = gridY * cellSize; y < (gridY + 1) * cellSize; y += 1) {
                for (
                    let x = gridX * cellSize;
                    x < (gridX + 1) * cellSize;
                    x += 1
                ) {
                    const offset = (y * size + x) * 4;
                    red += data[offset];
                    green += data[offset + 1];
                    blue += data[offset + 2];
                    pixels += 1;
                }
            }

            features.push(
                red / (pixels * 255),
                green / (pixels * 255),
                blue / (pixels * 255),
            );
        }
    }

    return features;
};

const refreshControls = () => {
    const counts = Object.fromEntries(labels.map((label) => [label, 0]));
    examples.forEach(({ label }) => {
        counts[label] += 1;
    });

    ui.counts.textContent = `Warm colors: ${counts[labels[0]]} · Cool colors: ${counts[labels[1]]}`;
    ui.addButton.disabled = !currentFeatures || isTraining;
    ui.trainButton.disabled =
        counts[labels[0]] < 3 || counts[labels[1]] < 3 || isTraining;
    ui.predictButton.disabled = !network || !currentFeatures || isTraining;
};

ui.imageInput.addEventListener("change", () => {
    const [file] = ui.imageInput.files ?? [];
    if (!file) {
        return;
    }

    if (currentImageUrl) {
        URL.revokeObjectURL(currentImageUrl);
    }

    currentFeatures = null;
    ui.result.textContent = "";
    currentImageUrl = URL.createObjectURL(file);
    ui.preview.hidden = true;
    ui.emptyPreview.hidden = false;
    setStatus("Loading image…");
    refreshControls();

    ui.preview.onload = () => {
        try {
            currentFeatures = extractFeatures(ui.preview);
            ui.preview.hidden = false;
            ui.emptyPreview.hidden = true;
            setStatus(
                "Image ready. Choose a label and add it, or train and test.",
            );
        } catch (error) {
            setStatus(error.message, "error");
        }
        refreshControls();
    };
    ui.preview.onerror = () => {
        setStatus("The selected file could not be loaded as an image.", "error");
        refreshControls();
    };
    ui.preview.src = currentImageUrl;
});

ui.addButton.addEventListener("click", () => {
    if (!currentFeatures) {
        return;
    }

    examples.push({
        features: currentFeatures,
        label: ui.labelSelect.value,
    });
    network = null;
    ui.result.textContent = "";
    setStatus("Example added. Add varied examples from both categories.");
    refreshControls();
});

ui.trainButton.addEventListener("click", async () => {
    if (isTraining) {
        return;
    }

    isTraining = true;
    refreshControls();
    setStatus("Training on the labeled examples…");

    try {
        // Training uses the uploaded images' extracted features in this page;
        // they are not sent to a remote training service.
        const candidate = ml5.neuralNetwork({
            task: "classification",
            debug: false,
        });
        await candidate.ready;
        examples.forEach(({ features, label }) => {
            candidate.addData(features, [label]);
        });
        candidate.normalizeData();
        await candidate.train(
            { epochs: 60, batchSize: 16, validationSplit: 0 },
            () => {},
        );
        network = candidate;
        setStatus("Training complete. Upload a new image and classify it.");
    } catch (error) {
        network = null;
        setStatus(`Training failed: ${error.message}`, "error");
    } finally {
        isTraining = false;
        refreshControls();
    }
});

ui.predictButton.addEventListener("click", async () => {
    if (!network || !currentFeatures || isTraining) {
        return;
    }

    ui.predictButton.disabled = true;
    setStatus("Classifying image…");
    try {
        const results = await network.classify(currentFeatures);
        const prediction = results[0];
        if (!prediction?.label) {
            throw new Error("The model returned no prediction.");
        }
        ui.result.textContent = `Prediction: ${prediction.label} (${(prediction.confidence * 100).toFixed(1)}% confidence)`;
        setStatus(
            "Try another image. A high confidence score still does not prove the prediction is correct.",
        );
    } catch (error) {
        setStatus(`Classification failed: ${error.message}`, "error");
    } finally {
        refreshControls();
    }
});

if (window.ml5?.neuralNetwork) {
    setStatus("Ready. Upload an image to begin.");
} else {
    setStatus(
        "Could not load ml5.js. Check the internet connection and reload.",
        "error",
    );
}

refreshControls();
