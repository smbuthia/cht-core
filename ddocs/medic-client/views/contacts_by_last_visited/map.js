function(doc) {
  if (doc.type === 'data_record' &&
      doc.form &&
      doc.fields &&
      doc.fields.visited_contact_uuid) {

    // Is a visit report about a family
    emit(doc.fields.visited_contact_uuid, doc.reported_date);
  } else if (doc.type === 'contact' ||
             doc.type === 'clinic' ||
             doc.type === 'health_center' ||
             doc.type === 'district_hospital' ||
             doc.type === 'person') {
    // Is a contact type
    emit(doc._id, 0);
  }
}
