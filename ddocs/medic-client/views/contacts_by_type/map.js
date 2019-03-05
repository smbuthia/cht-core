function(doc) {
  var types = [ 'district_hospital', 'health_center', 'clinic', 'person' ];
  var type = doc.type === 'contact' ? doc.contact_type : doc.type;
  var idx = types.indexOf(type); // TODO sorting index is going to be difficult...
  var dead = !!doc.date_of_death;
  if (idx !== -1) {
    var order = dead + ' ' + idx + ' ' + (doc.name && doc.name.toLowerCase());
    emit([ type ], order);
  }
}
