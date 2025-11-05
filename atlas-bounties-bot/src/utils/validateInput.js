const validateInput = (value, options = {}) => {
    const { maxValue = Number.MAX_VALUE } = options;

    if (value.length > maxValue) {
        return { valid: false, error: `Size máximo é ${maxValue}` };
    }

    return { valid: true, value: value };
};

module.exports = { validateInput };