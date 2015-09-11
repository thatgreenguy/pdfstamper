// pdfaddlogo.js
//
// Description		: Add Dlink Logo image to each page of a PDF file
// Author		: Paul Green
// Dated		: 2015-08-06
//
// Synopsis
// --------
// 
// Expect PDF file to process to be passed in - including path

 
var hummus = require('hummus'),
  pdfInput = process.argv[ 2 ],
  pdfOutput = process.argv[ 3 ],
  pdfInput = process.argv[ 2 ];


// Create pdf Writer object to manipulate the PDF file
////var pdfWriter = hummus.createWriterToModify('/src/shareddata/R5542565_PJGTST251_179553_PDF',{modifiedFilePath:'/src/shareddata/well.pdf'});
var pdfWriter = hummus.createWriterToModify(pdfInput, {modifiedFilePath:pdfOutput});

// Create re-usable form object to hold logo image and set image, location, scale
var formObject = pdfWriter.createFormXObjectFromJPG('/src/data/logo/Dlink_Logo.jpg');
var formPositionOnPage = [470,790];
var formScaleOnPage = 0.5;

// allocate an object ID for the new contents stream (for placing the form object)
// we first create the modified page object, so that we can define a name for the new form xobject
// that is unique
var objCxt = pdfWriter.getObjectsContext();
var newContentObjectID = objCxt.allocateNewObjectID();

// create a copying context, so we can copy the page dictionary, and modify its contents + resources dict
var cpyCxt = pdfWriter.createPDFCopyingContextForModifiedFile();

// Get maximum number of Pages we are dealing with
var pageCount = cpyCxt.getSourceDocumentParser().getPagesCount();

for ( var i = 0; i < pageCount; i++ ) {

	// Add logo (form object) to each page of PDF 
	slapLogoOnPage(i);
}

// Finish up and write new PDF file with logos
pdfWriter.end();




function slapLogoOnPage(whichPage) {

//var lastPageObjectID = cpyCxt.getSourceDocumentParser().getPageObjectID(cpyCxt.getSourceDocumentParser().getPagesCount()-1);
//var lastPageDictionaryObject = cpyCxt.getSourceDocumentParser().parsePage(cpyCxt.getSourceDocumentParser().getPagesCount()-1).getDictionary().toJSObject();

// Determine which Page we are looking at
var PageObjectID = cpyCxt.getSourceDocumentParser().getPageObjectID(whichPage);
var PageDictionaryObject = cpyCxt.getSourceDocumentParser().parsePage(whichPage).getDictionary().toJSObject();

// create modified page object
objCxt.startModifiedIndirectObject(PageObjectID);
var modifiedPageObject = objCxt.startDictionary();

// copy all elements of the page to the new page object, but the "Contents" and "Resources" elements
 Object.getOwnPropertyNames(PageDictionaryObject).forEach(function(element,index,array)
                                                    {
                                                        if(element != 'Resources' && element != 'Contents')
                                                        {
                                                            modifiedPageObject.writeKey(element);
                                                            cpyCxt.copyDirectObjectAsIs(PageDictionaryObject[element]);
                                                        }
                                                    });

// Write new contents entry, joining the existing contents with the new one. take care of various scenarios of the existing Contents
modifiedPageObject.writeKey('Contents');
if(!PageDictionaryObject['Contents']) // no contents
{
	objCxt.writeIndirectObjectReference(newContentObjectID);
}
else
{
	objCxt.startArray();
	if(PageDictionaryObject['Contents'].getType() == 'hummus.ePDFObjectArray') // contents stream array
	{
		PageDictionaryObject['Contents'].toPDFArray().toJSArray().forEach(function(inElement)
		{
			objCxt.writeIndirectObjectReference(inElement.toPDFIndirectObjectReference().getObjectID());
		});
	}
	else // single stream
	{
		objCxt.writeIndirectObjectReference(PageDictionaryObject['Contents'].toPDFIndirectObjectReference().getObjectID());
	}

	objCxt.writeIndirectObjectReference(newContentObjectID);
	objCxt.endArray();
}

// Write a new resource entry. copy all but the "XObject" entry, which needs to be modified. Just for kicks i'm keeping the original 
// form (either direct dictionary, or indirect object)
var resourcesIndirect = null;
var imageObjectName = 'myImage';
modifiedPageObject.writeKey('Resources');
if(!PageDictionaryObject['Resources'])
{
	// no existing resource dictionary, so write my own
	var dict = objCxt.startDictionary();
	dict.writeKey('XObject');
	var xobjectDict = objCxt.startDictionary();
	xobjectDict.writeKey(imageObjectName);
	xobjectDict.writeObjectReferenceValue(formObject.id);
	objCxt.endDictionary(xobjectDict).
	       endDictionary(dict);
}
else
{
	// resources may be direct, or indirect. if direct, write as is, adding the new form xobject, otherwise wait till page object ends and write then
	isResorucesIndirect =  (PageDictionaryObject['Resources'].getType() == hummus.ePDFObjectIndirectObjectReference);
	if(isResorucesIndirect)
	{
		resourcesIndirect = PageDictionaryObject['Resources'].toPDFIndirectObjectReference().getObjectID();
		modifiedPageObject.writeObjectReferenceValue(resourcesIndirect);
	}
	else
		imageObjectName = writeModifiedResourcesDict(PageDictionaryObject['Resources'],objCxt,cpyCxt,formObject.getID());
}

// end page object and writing
objCxt.endDictionary(modifiedPageObject).
		endIndirectObject();

// if necessary, create now the resource dictionary
if(resourcesIndirect)
{
	objCxt.startModifiedIndirectObject(resourcesIndirect);
	imageObjectName = writeModifiedResourcesDict(cpyCxt.getSourceDocumentParser().parseNewObject(resourcesIndirect),objCxt,cpyCxt,formObject.id);
	objCxt.endIndirectObject();
}


// last but not least, create the actual content stream object, placing the form
objCxt.startNewIndirectObject(newContentObjectID);
var streamCxt = objCxt.startUnfilteredPDFStream();
objCxt.writeKeyword('q')
		.writeNumber(formScaleOnPage)
		.writeNumber(0)
		.writeNumber(0)
		.writeNumber(formScaleOnPage)
		.writeNumber(formPositionOnPage[0])
		.writeNumber(formPositionOnPage[1])
		.writeKeyword('cm')
		.writeName(imageObjectName)
		.writeKeyword('Do')
		.writeKeyword('Q')
		.endPDFStream(streamCxt)
		.endIndirectObject();

}





function writeModifiedResourcesDict(inSourceDirect,inObjCxt,inCpyCxt,inNewXObjectID)
{
	var imageObjectName = 'myImage';
	var sourceObject = inSourceDirect.toPDFDictionary().toJSObject();
	var dict = inObjCxt.startDictionary();
 	Object.getOwnPropertyNames(sourceObject).forEach(function(element,index,array)
                                                    {
                                                        if(element != 'XObject')
                                                        {
                                                            dict.writeKey(element);
                                                            inCpyCxt.copyDirectObjectAsIs(sourceObject[element]);
                                                        }
                                                    });

	// now write a new xobject entry.
	dict.writeKey('XObject');
	var xobjectDict = inObjCxt.startDictionary();
	if(sourceObject['XObject']) // original exists, copy its keys
	{
		// i'm having a very sophisticated algo here to create a new unique name. 
		// i'm making sure it's different in one letter from any name, using a well known discrete math proof method
		imageObjectName = '';
		var jsDict = sourceObject['XObject'].toPDFDictionary().toJSObject();
 		Object.getOwnPropertyNames(jsDict).forEach(function(element,index,array)
                                                    {
                                                            xobjectDict.writeKey(element);
                                                            inCpyCxt.copyDirectObjectAsIs(jsDict[element]);
                                                            imageObjectName+=String.fromCharCode(
                                                            		getDifferentChar(element.length >= index+1 ? element.charCodeAt(index) : 0x39));
                                                    });		
 		inObjCxt.endLine();
	}


	xobjectDict.writeKey(imageObjectName);
	xobjectDict.writeObjectReferenceValue(inNewXObjectID);
	inObjCxt.endDictionary(xobjectDict)
		    .endDictionary(dict);

	return imageObjectName;
}

function getDifferentChar(inCharCode)
{
	// numerals
	if(inCharCode >= 0x30 && inCharCode <= 0x38)
		return inCharCode+1;
	if(inCharCode == 0x39)
		return 0x30;

	// lowercase
	if(inCharCode >= 0x61 && inCharCode <= 0x79)
		return inCharCode+1;
	if(inCharCode == 0x7a)
		return 0x61;

	// uppercase
	if(inCharCode >= 0x41 && inCharCode <= 0x59)
		return inCharCode+1;
	if(inCharCode == 0x5a)
		return 0x41;

	return 0x41;
}
