/**
 * @class AmazonS3

Provides a utility class for uploading files direct to the Amazon S3 service, using CORS.
Requires a server-side page to be created, as specified by AmazonS3#signingUrl, which takes in the file name ("name") and file type ("type"), and digitally signs the request for submission to Amazon S3.


Class created by Daniel Gallo, based on non-Sencha code sample from [here](http://www.ioncannon.net/programming/1539/direct-browser-uploading-amazon-s3-cors-fileapi-xhr2-and-signed-puts/).


Example usage:

    AmazonS3.uploadFile(fileUploadField);

You can also pass in a configuration to override some of the default properties:

    AmazonS3.uploadFile(fileUploadField, {
        signingUrl: 'newurl.php',
        invalidFileMessage: 'Please select a file.'
    });

And have callbacks when a file has successfully uploaded:

    AmazonS3.uploadFile(fileUploadField, {
        successCallback: function(response) {
            console.log('success');
        }
    });

Preview:

{@img fileuploadfield.png File upload field in a form}

During upload:

{@img progressbar.png Progress bar during upload}

Example signing page (in PHP):

    <?php

    // The following 3 properties are specific to your Amazon S3 setup. The Secret Key should obviously not be shared or divulged.
    $S3_KEY='Public Key Here';
    $S3_SECRET='Secret Key Here';
    $S3_BUCKET='/Bucket Name Here';

    $EXPIRE_TIME=(60 * 5); // 5 minutes
    $S3_URL='http://s3-us-west-2.amazonaws.com';

    // The full file name including extension
    $objectName='/' . urlencode($_GET['name']);

    // File MIME type
    $mimeType=$_GET['type'];
    $expires = time() + $EXPIRE_TIME;
    $amzHeaders= "x-amz-acl:public-read";

    // The string to sign, based on the request type, MIME type of the file, headers and file path
    $stringToSign = "PUT\n\n$mimeType\n$expires\n$amzHeaders\n$S3_BUCKET$objectName";

    // Sign the string with the S3 Secret key.
    $sig = urlencode(base64_encode(hash_hmac('sha1', $stringToSign, $S3_SECRET, true)));

    // Generate the URL to where the file should be uploaded on Amazon S3, appending query string params such as the S3 public key, expiry time and signature
    $url = urlencode("$S3_URL$S3_BUCKET$objectName?AWSAccessKeyId=$S3_KEY&Expires=$expires&Signature=$sig");

    // Return the signed Amazon S3 URL
    echo $url;
    ?>

 * @singleton
 */
Ext.define('AmazonS3', {
    singleton: true,

    requires: [
        'Ext.Ajax',
        'Ext.ProgressBar',
        'Ext.String',
        'Ext.window.MessageBox',
        'Ext.window.Window'
    ],

    config: {
        /**
        * @cfg {Ext.form.field.File} fileUploadField
        * The file upload field containing the file to upload.
        */
        fileUploadField: null,

        /**
        * @cfg {Boolean} allowCancel
        * If set to true, the user will be able to cancel the upload through the use of a Cancel button.
        */
        allowCancel: true,

        /**
        * @cfg {String} cancelText
        * Text that's shown within the Cancel button.
        */
        cancelText: 'Cancel',

        /**
        * @cfg {String} signingUrl
        * The URL to your page that accepts the file name and file type, and returns a signed Amazon S3 URL for uploading to the S3 service.
        * You can see an [example of a PHP signing page here](http://www.ioncannon.net/programming/1539/direct-browser-uploading-amazon-s3-cors-fileapi-xhr2-and-signed-puts/).
        */
        signingUrl: 'signfile.php',

        /**
        * @cfg {String} invalidFileMessage
        * Message that's shown to the user if there isn't a file to upload.
        */
        invalidFileMessage: 'Please provide a file to upload.',

        /**
        * @cfg {String} invalidBrowserMessage
        * Message that's shown to the user if their browser doesn't support this type of file upload.
        */
        invalidBrowserMessage: 'Your browser doesn\'t support the ability to upload files using this method.',

        /**
        * @cfg {String} finalizingText
        * The text that's shown within the Progress Bar when the upload is finalising.
        */
        finalizingText: 'Finalising.',

        /**
        * @cfg {String} uploadingText
        * The text that's shown within the Progress Bar when the file is uploading.
        */
        uploadingText: 'Uploading.',

        /**
        * @cfg {String} abortedText
        * The text that's shown within the Progress Bar when the upload has been aborted.
        */
        abortedText: 'Aborted.',

        /**
        * @cfg {String} completedText
        * The text that's shown within the Progress Bar when the upload has completed successfully.
        */
        completedText: 'Upload completed.',

        /**
        * @event progressCallback
        * Fired when the file commences upload and there is progress information.
        * @param {Object} progress The progress event object.
        */
        progressCallback: null,

        /**
        * @event successCallback
        * Fired when the file has successfully uploaded to the remote server.
        * @param {Object} response The response object.
        */
        successCallback: null,

        /**
        * @event failureCallback
        * Fired when the file has failed to upload to the remote server.
        */
        failureCallback: null,

        /**
        * @event abortCallback
        * Fired when the upload has been cancelled by the user.
        * @param {Object} response The response object.
        */
        abortCallback: null,

        // Reference to the progress bar component.
        progressBar: null,

        // Reference to the progress window component.
        progressWindow: null,

        // Reference to the XMLHttpRequest object.
        xhr: null
    },

    /**
    * Uploads the file from the provided {@link Ext.form.field.File} field.
    * @param {Ext.form.field.File} fileUploadField The file upload field.
    * @param {Object} config The configuration options.
    */
    uploadFile: function(fileUploadField, config) {
        var me = this;

        me.fileUploadField = fileUploadField;

        config = config || {};
        Ext.apply(me, config);

        // If there's no file selected in the file upload field
        if (me.fileUploadField.fileInputEl.dom.files.length === 0) {
            me.showError(me.getInvalidFileMessage());
            return;
        }

        var file = me.fileUploadField.fileInputEl.dom.files[0],
            url = me.getSigningUrl();

        // Fire off a request to the signing page. This will return a signed Amazon S3 URL that will be used for the upload.
        Ext.Ajax.request({
            url: url,
            method: 'GET',
            params: {
                name: file.name,
                type: file.type
            },
            success: function(response) {
                // Signed Amazon S3 URL has been returned successfully from the signing page, so commence the upload.
                me.startUpload(file, decodeURIComponent(response.responseText));
            },
            failure: function(response) {
                // Couldn't get the URL from the signing page, so show error to user.
                me.updateStatus(0, 'Could not contact signing script. Status = ' + response.status);
            }
        });
    },

    /**
    * Cancels the upload currently in progress.
    * @param {Ext.button.Button} button Reference to the Cancel button.
    */
    cancelUpload: function(button) {
        var me = this;

        // Abort the file upload
        me.xhr.abort();

        // Stop the button being clicked multiple times
        button.disable();

        // Update the progress bar to zero percent, and show the aborted text
        me.updateStatus(0, me.abortedText);

        // Close progress window after one second
        me.closeProgressWindow();

        Ext.callback(me.abortCallback, me);
    },

    /**
    * Starts the file upload process.
    * @private
    * @param {Object} file The underlying File Object file from the {@link Ext.form.field.File} field.
    * @param {String} signedUrl The Amazon S3 signed url. This is the url to where the file will be uploaded, and should contain a signature for authorising the request.
    */
    startUpload: function(file, signedUrl) {
        var me = this,
            xhr = me.xhr = me.createCorsRequest('PUT', signedUrl);

        if (!xhr) {
            me.showError(me.getInvalidBrowserMessage());
        } else {
            xhr.onload = function() {
                if (xhr.status == 200) {
                    Ext.callback(me.successCallback, me, [xhr]);

                    me.updateStatus(100, me.completedText);

                    // Reset the file upload field after upload has successfully completed.
                    me.getFileUploadField().reset();

                    me.closeProgressWindow();
                } else {
                    Ext.callback(me.failureCallback, me, [xhr]);

                    me.updateStatus(0, 'Upload error: ' + xhr.status);
                }

                me = null;
            };

            xhr.onerror = function(response) {
                Ext.callback(me.failureCallback, me, [response]);

                // Upload error - show message to user
                me.updateStatus(0, 'An upload error has occurred.');

                me = null;
            };

            xhr.upload.onprogress = function(e) {
                Ext.callback(me.progressCallback, me, [e]);

                if (e.lengthComputable) {
                    // File is uploading, get the progress of the upload and update the progress bar based on this information
                    var percentLoaded = Math.round((e.loaded / e.total) * 100);
                    me.updateStatus(percentLoaded, percentLoaded == 100 ? me.getFinalizingText() : me.getUploadingText());
                }
            };

            xhr.setRequestHeader('Content-Type', file.type);
            xhr.setRequestHeader('x-amz-acl', 'public-read');

            xhr.send(file);
        }
    },

    /**
    * Shows an error message inside a {@link Ext.window.MessageBox}.
    * @private
    * @param {String} error The error message to show inside the generated {@link Ext.window.MessageBox}.
    */
    showError: function(error) {
        Ext.Msg.show({
            title: 'Error',
            msg: error,
            buttons: Ext.Msg.OK,
            icon: Ext.Msg.ERROR
        });
    },

    /**
    * Updates the status of the file upload using a progress bar.
    * @private
    * @param {Number} percent The percentage complete of the file upload.
    * @param {String} status The status message of the file upload.
    */
    updateStatus: function(percent, status) {
        var me = this;

        if (!me.progressWindow) {
            var allowCancel = me.allowCancel,
                windowHeight = (allowCancel ? 140 : 102),   // Alter the window's height, based on whether the toolbar and Cancel button are included
                dockedItems = {};

            if (allowCancel) {
                dockedItems = {
                    xtype: 'toolbar',
                    dock: 'bottom',
                    items: [{
                        xtype: 'tbfill'
                    }, {
                        xtype: 'button',
                        text: me.cancelText,
                        handler: function(button) {
                            me.cancelUpload(button);
                        }
                    }, {
                        xtype: 'tbfill'
                    }]
                };
            }

            // Create a progress window, containing a progress bar.
            me.progressWindow = Ext.create('Ext.window.Window', {
                title: 'File Upload',
                height: windowHeight,
                width: 350,
                bodyPadding: 20,
                modal: true,
                closable: false,
                draggable: false,
                resizable: false,
                layout: 'fit',
                items: {
                    xtype: 'progressbar'
                },
                dockedItems: dockedItems
            }).show();

            me.progressBar = me.progressWindow.down('progressbar');
        }

        // Update the progress bar based on percentage complete, and show the associated status message.
        me.getProgressBar().updateProgress(percent / 100, status);
    },

    /**
    * Closes the progress window. Called either when the upload has completed or the user has cancelled the upload.
    * @private
    */
    closeProgressWindow: function() {
        var me = this;

        // Destroy the progress window after one second following the completion of the file upload.
        Ext.Function.defer(function(){
            Ext.destroy(me.getProgressWindow());
            me.progressWindow = null;
            me.progressBar = null;
        }, 1000);
    },

    /**
    * Creates a CORS request that can then be used for the file upload.
    * @private
    * @param {String} method The method to use in the request (PUT, POST).
    * @param {String} url The Amazon S3 url where the file should be uploaded, as returned from the signing url.
    * @return {Object}
    */
    createCorsRequest: function(method, url) {
        var xhr = new XMLHttpRequest();

        if ("withCredentials" in xhr) {
            xhr.open(method, url, true);
        } else if (typeof XDomainRequest != "undefined") {
            xhr = new XDomainRequest();
            xhr.open(method, url);
        } else {
            xhr = null;
        }

        return xhr;
    }
});