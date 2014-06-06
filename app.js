
var App = function(general_settings) {
	"use strict";

	

	var ajax_commands = {
		apply_response: function(command, fn, target){
			if (!command.target)
				command.target = target;

			if (command instanceof Array)
				$(command).each(function(){
					fn.apply(this);
				});
			else fn.apply(command);
		},
		process_response: function(response, status, xhr, target) {
			if (typeof response == "object") {

				// Run write_to_region first before anything else
				if (response["write_to_region"]) {
					self.apply_response(response["write_to_region"], self["write_to_region"], target);
					delete response["write_to_region"];
				}
				for(var i in response) {
					if (typeof self[i] == "function") {
						if (response[i]) {
							self.apply_response(response[i], self[i], target);
						}
					}
				}

				/** Server Response commands:
					* (alert) { title, body, type }
					* (clear_selection) { target }
					* (load) { url, delay }
					* (popup) { title, body, width }
					* (popup_close) { target }
					* (redirect) { url, delay }
					* (refresh_table) { target: target object }
					* (refresh_chart) { target: (array of target objects) }
					* (session_destroyed) { }
					* (set_route) { url }
					* (validation_error) { form_id, errors }
					* (validation_error_blur) { form_id, field_id, errors }
					* (write_to_region) { target, body }
				*/

			} else if (response === false) {
				$.pnotify({
					title: "No Reply",
					type: "info"
				});
			} else if (status != "success") {
				$.pnotify({
					title: "Server Error",
					text: "Something went wrong in our server." + typeof response,
					type: "warning"
				});
			}
		},
		salvage_response: function(a,b,c) {
			if (a.responseText) {
				var jsonStart = a.responseText.indexOf('{"');
				var error = a.responseText.substr(0, jsonStart);
				var json = a.responseText.substr(jsonStart);

				if (self.debug && $.trim(error))
					$.pnotify({
						"title": "Server Debug Message",
						"text" : error,
						"type" : "default"
					});
				try {
					var response = JSON.parse(json);
					self.process_response(response);
				} catch(e) {
				}
			} else {
				$.pnotify({
					"title": "Server Error",
					"text" : "Please try again later. Please contact Promotexter if the problem persists.",
					"type" : "error"
				});
			}
		},
		alert: function() {
			var notice = $.pnotify({
				title: this.title,
				text: this.body,
				type: this.type,
				closer: false,
				sticker: false,
				shadow: false,
				nonblock: true,
				nonblock_opacity: .2,
				animation: 'none'
			}).click(function() {
				notice.pnotify_remove();
			});
		},
		clear_selection: function() {
			$(this.target).each(function(){
				var table_id = $(this).attr("id");
				if (table_id) {
					$("#"+table_id + "-actions").fadeOut("fast");
					self.datatableSelected["#"+table_id] = [];
					$("#"+table_id + " #select_all").prop("checked", false);
				}
			});
		},
		dynamic_variables: function() {
			var container = this.target;
			for(var i in this.variables){
				$(container).find("[data-variable='" + i + "']").html(this.variables[i]);
			};
		},
		form_alert: function() {
			if (this && (this.body || this.title) && this.form_id)
			$(this.form_id).prepend("<div class='alert alert-" + this.type + " form-alert'><strong>" + (this.title||"") + "</strong> " + (this.body||"") + "</div>");
		},
		fill_form: function() {
			for (var form in this) {
				for (var field in this[form]) {
					self.set_data(form, field, this[form][field]);
				}
			};
		},
		load: function() {
			var url = this.url;
			var oncomplete = this.complete;
			var load = false;
			var async = (this.async === undefined ? true : this.async);
			var target = this.target;

			if (this.allowed_urls) {
				var loc = location.href.replace(self.base_url, "");
				for (var i in this.allowed_urls) {
					if (loc.indexOf(this.allowed_urls[i]) == 0 || location.href.indexOf(this.allowed_urls[i]) == 0) {
						load = true;
						break;
					}
				}
			} else if (this.reroute) {
				if (location.href.indexOf(this.url) < 0) load = true;
			} else load = true;

			if (load)
			setTimeout(function(){
				self.xhrs[url] = $.ajax({
					url: url + (url.indexOf("?") >= 0 ? "&_ref=load" : "?_ref=load"),
					async: async,
					dataType: "json",
					initiator: "load function",
					success: function(response, status, xhr){
						self.process_response(response, status, xhr, target);
					},
					complete: oncomplete
				});
			}, this.delay);
		},
		popup: function() {
			$("#omni-modal-title").html(this.title);
			$("#omni-modal-body").html(this.body);
			$("#omni-modal").modal();

			self.attach_handlers("#omni-modal-body");

			if (this.width) $("#omni-modal").find(".modal-dialog").css("min-width", this.width);
			else $("#omni-modal").find(".modal-dialog").css("min-width", "");
		},
		popup_close: function() {
			var target = this.target;
			setTimeout(function() {
				$(target).modal("hide");
			}, this.delay);
		},
		redirect: function() {
			var tmp = this;
			setTimeout(function() {
				window.location.href = tmp.url;
			}, tmp.delay);
		},
		refresh_chart: function() {
			$(this).each(function(){
				var chart_data = this.data;
				var options = this.options;
				var chartType = this.type;
				$(this.target).each(function(){
					var chart_id = "#"+$(this).attr("id");
					var data = $(this).data();
					switch(data.chartType || chartType) {
						case "line": self.render_line_chart(chart_id, chart_data, options); break;
						case "pie": self.render_pie_chart(chart_id, chart_data, options); break;
						case "bar": self.render_bar_chart(chart_id, chart_data, options); break;
					}
				});
			});
		},
		refresh_table: function() {
			$(this.target).each(function(){
				var table_id = $(this).attr("id");
				if (table_id) {
					if ($("#"+table_id + "_wrapper .pagination .active").length)
						$("#"+table_id + "_wrapper .pagination .active").click();
					else self.datatables["#"+table_id].fnDraw();
				}
			});
		},
		render_progress_bar: function() {
			$(this).each(function(){
				var target = this.target;
				var progress = $("<div class='progress " + (this.active? "progress-striped active" : "" ) + "'></div>");
				$(this.bars).each(function(){
					var bar = $("<div class='progress-bar progress-bar-" + this.type + "' style='width:" + this.percentage + "%'><span class='sr-only'>" + this.percentage + "%</span></div>");
					$(progress).append(bar);
				});
				$(target).html(progress);
			});
		},
		session_destroyed: function() {
			self.confirm(function(){window.location.reload()}, {
				title: "Not Logged In",
				message: "Please log in to continue.",
				button: "Log In"
			});
		},
		set_data: function(form, element, value)
		{
			// $(form + " input[name='"+element+"']").val(value);

			var key = form + ' [name='+element+']';


			if ($(key).hasClass("form-select2")) {
				$(key).select2("val", value || "");
			}
			else if($(key).is(":radio"))
			{
				 $(key + "[value='" + value + "']").prop('checked', true);
			}
			else
			{
				$(key).val(value);
			}
		},
		set_route: function() {
			self.route_set_from_controller = true;
			if (self.timeouts) 
				for(var i in self.timeouts) {
					clearTimeout(self.timeouts[i]);
				}
			if (window.history.pushState) {
				if (!self.route_set_from_popstate && (!history.state || this.url != history.state.url)) {
					window.history.pushState(this, "", this.url);
				}
				self.route_set_from_popstate = false;
			}
			else location.hash = "!/" + this.url;
		},
		validation_error: function() {
			$(this.form_id + " .insert-error, " + this.form_id + " .form-error").remove();
			$(this.form_id + " .form-group").removeClass("has-warning")//.addClass("has-success");

			for (var i in this.errors){
				if (i == "form") {
					$(this.form_id).prepend("<div class='alert alert-warning form-error'>" + this.errors[i] + "</div>");
				}
				else if (this.errors[i]) {
					$(this.form_id + "-" + i).before("<span class='insert-error label label-warning'>" + this.errors[i] + "</span>");
					$(this.form_id + "-" + i).parents(".form-group").addClass("has-warning")//.removeClass("has-success");
				}
			};
		},
		validation_error_blur: function() {
			$(this.field_id).parents(".form-group").removeClass("has-warning")//.addClass("has-success")
			.find(".insert-error").remove();
			for (var i in this.errors){
				if (this.errors[i]) {
					$(this.form_id + "-" + i).before("<span class='insert-error label label-warning'>" + this.errors[i] + "</span>");
					$(this.form_id + "-" + i).parents(".form-group").addClass("has-warning")//.removeClass("has-success");
				}
			};
		},
		write_to_region: function() {
			var target = this.target || self.temp_target || self.region_target;

			self.temp_target = null;

			$(target).html(this.body).show();

			if (this.animation) {
				$(target).hide().slideDown();
			}
			// if (this.datatables) {
			// 	for (var i in this.datatables) {
			// 		$(this.datatables[i].table).data("action-list", this.datatables[i].actionList);
			// 	}
			// }
			self.attach_handlers(target);
		}
	}

	var on_load_functions = {
		ajaxify: function(selector) {
			$(selector).each(function(){
				var options = $(this).data();
				var btn = this;
				var btnText = $(this).html();

				

				if (!options.url && $(this).attr("href")) {
					// warning("You are using href on an item with ajaxify class. Use data-url instead."); 
					options.url = $(this).attr("href");
				}
				else if (!options.url) return error("You forgot to set the url in DOM element dataset"); 
				options.url += (options.url.indexOf("?") >= 0 ? "&_ref=app" : "?_ref=app");
				$(this).click(function(e){

					self.temp_target = options['target'] || null;

					if (!(e.shiftKey || e.ctrlKey) && e.button == 0) {
						e.preventDefault();
						if (!$(btn).data("propagate"))
							e.stopPropagation();
						
						var send = function() {
							if (!$(btn).prop("disabled")) {
								$.ajax($.extend({}, {
									initiator: btn,
									type: "get",
									beforeSend: function() {
										var reg = /^<[a-z]+ .*fa fa-[0-9a-z \-]+.*><\/[a-z]+>$/ig;
										if ($.trim(btnText).match(reg))
											$(btn).prop("disabled", true).html("<i class='fa fa-spin fa-spinner'></i>");
										else if ($(btn).hasClass("pull-right"))
											$(btn).addClass("disabled").prop("disabled", true).html("Sending <i class='fa fa-spin fa-spinner'></i>");
										else $(btn).addClass("disabled").prop("disabled", true).html("<i class='fa fa-spin fa-spinner'></i> Loading");
									},
									complete: function() {
										$(btn).prop("disabled", false).html(btnText).removeClass("disabled");
									},
									error: self.salvage_response,
									success: self.process_response,
									dataType: "json"
								}, options));
							}
						}

						if (options.confirm)
							self.confirm(send, {message: options.confirm});
						else 
							send();
					}
				});
			});
		},
		ajaxify_form: function(form) {
			$(form).find("input[type=submit]").click(function(){
				$("input[type=submit]", $(this).parents("form")).removeAttr("clicked");
				$(this).attr("clicked", "true");
			});

			$(form).submit(function(e) {
				e.preventDefault();
				var parent = this;
				var btnTexts = [];
				$(this).find(":submit").each(function(i){
					btnTexts.push($(this).val() || $(this).html());
				});
				$(this).find(".form-alert").remove();
				$(this).find(".form-group").removeClass("has-error").removeClass("has-success");
				$(this).find(".insert-error").remove();
				var sbmt = $("input[type=submit][clicked=true]");
				var sbtmval = "";
				if (sbmt.length)
					sbtmval = "&" + sbmt.attr("name") + "=1";

				$("input[type=submit]", this).removeAttr("clicked");

				$.ajax({
					initiator: parent,
					url: $(this).attr("action"), 
					data: $(this).serialize() + sbtmval, 
					type: $(this).attr("method"), 
					beforeSend: function() {
						$(parent).find(":submit").prop("disabled", true).val("Sending...");
						$(parent).find(":submit").each(function(i){
							if ($(this).hasClass("pull-right"))
								$(this).html("Sending <i class='fa fa-spin fa-spinner'></i>");
							else $(this).html("<i class='fa fa-spin fa-spinner'></i> Sending")
						});
						$(parent).find(":input:not(:disabled)").prop("disabled", true).addClass("form-disabled");
					},
					complete: function() {
						$(parent).find(":submit").prop("disabled", false);
						$(parent).find(":submit").each(function(i){
							$(this).val(btnTexts[i]).html(btnTexts[i]);
						});
						$(parent).find(".form-disabled").prop("disabled", false).removeClass("form-disabled");
					},
					error: self.salvage_response,
					success: function(response, status, xhr){
						self.process_response(response, status, xhr, $(parent).data("target"));
					}, 
					dataType: 'json' 
				});

				return false;
			});
		},
		ajaxify_upload: function(form) {
			$(form).each(function(){
				var parent = this;
				var btnText = $(this).find(":submit").val() || $(this).find(":submit").html();
				var progress = $(parent).find(".progress");
				var progress_bar = $(parent).find(".progress .progress-bar");
				var percentage = $(parent).find(".sr-only");
				self.async_script('assets/javascripts/jquery.form.js',function(){

					$(parent).find("input[type='file']").change(function(){
						if (this.files.length) {
							$(".file-selected").val(this.files[0].name);

							if ($(parent).data("file-ext")) {
								var file_extensions = $(parent).data("file-ext").split(",");
								var valid = false;
								for(var ext in file_extensions) {
									if (this.files[0].name.match(new RegExp("\." + file_extensions[ext] + "$", "i")))
										valid = true;
								}
								if(!valid) {
									$(parent).find(":submit").prop("disabled", true);
									$.pnotify({
										"title": "File type not allowed",
										"type" : "error"
									});
								}
								else {
									$(parent).find(":submit").prop("disabled", false);
								}
							}
							else if ($(parent).data("max-size")) {
								if(this.files[0].size > $(parent).data("max-size")) {
									$(parent).find(":submit").prop("disabled", true);
									$.pnotify({
										"title": "File size exceeds 4MB",
										"type" : "error"
									});
								}
								else {
									$(parent).find(":submit").prop("disabled", false);
								}
							}
							// if ($(parent).data("max-size"))
						} else {
							$(parent).find(":submit").prop("disabled", false);
							$(".file-selected").val("No file selected");
						}
					});
					$(".file-selected").click(function(){
						$(parent).find("input[type='file']").click();
					});

					$(parent).ajaxForm({
						dataType: 'json',
						beforeSend: function() {
							$(parent).find(":submit").prop("disabled", true).val("Sending...").html("<i class='fa fa-spin fa-spinner'></i> Sending");
							$(parent).find(":input:not(:disabled)").prop("disabled", true).addClass("form-disabled");
							var percentVal = '0%';
							$(progress).show();
							$(progress_bar).css("width", percentVal);
							$(percentage).html(percentVal);
						},
						uploadProgress: function(event, position, total, percentComplete) {
							var percentVal = percentComplete + '%';
							$(progress_bar).css("width", percentVal);
							$(percentage).html(percentVal);
						},
						success: function() {
							var percentVal = '100%';
							setTimeout(function() {
								$(progress).hide();
							}, 1000);
							$(progress_bar).css("width", percentVal);
							$(percentage).html(percentVal);
						},
						complete: function(xhr) {
							$(parent).find(":submit").prop("disabled", false).val(btnText).html(btnText);
							$(parent).find(".form-disabled").prop("disabled", false).removeClass("form-disabled");
							try {
								var obj = JSON.parse(xhr.responseText);
								setTimeout(function() {
									self.process_response(obj);
								}, 1000);
							}
							catch(e) {
								$.pnotify({
									type: 'error',
									title: "Unknown Upload Error",
									text: xhr.responseText
								});
							}
						}
					}); 
				});
			});
		},
		attach_handlers: function(parent) {
			if (typeof parent == "string") parent += " ";
			else parent = "";

			$(parent + ".form-select2").each(function(){ $(this).select2($(this).data()); });
			$(parent + ".form-date").each(function(){ $(this).datepicker($(this).data()); });
			$(parent + ".input-daterange").each(self.form_date_range);
			$(parent + ".form-time").each(function(){ $(this).timepicker(); });
			$(parent + ".form-datetime").each(function(){ $(this).datetimepicker(); });
			$(parent + ".batch-process").click(self.batch_process);
			$(parent + ".form-sms-message").each(self.sms_count);
			$(parent + ".line-check").each(self.line_check);
			$(parent + ".square-check").each(self.square_check);
			$(parent + ".item-toggle").change(self.toggle);
			$(parent + ".relay-check").click(self.relay_check);
			$(parent + ".duplicate").click(self.duplicate);
			$(parent + "[data-validation]").each(self.validate);
			$(parent + ".ajax-region").each(function(){ self.load.apply({ url: $(this).data("url"), target: "#" + $(this).attr("id") }); });
			$(parent + ".server-status").each(self.server_status);
			$(parent + ".tree").each(self.render_tree);

			self.render_chart(parent + ".flot-comp");
			self.render_datatable(parent + ".datatable");
			self.ajaxify_form(parent + ".ajaxify-form");
			self.ajaxify(parent + ".ajaxify");
			self.ajaxify_upload(parent + ".ajaxify-upload");
		},
		batch_process: function(e) {
			e.preventDefault();
			var datatable_wrapper = $(this).parents(".dataTables_wrapper");
			var datatable = $(datatable_wrapper).find(".dataTable");
			var datatable_id = "#"+$(datatable).attr("id");
			var process_url = $(this).attr("data-url");
			var batch_ids = {id:self.datatableSelected[datatable_id]};
			var c = batch_ids.id.length;

			self.confirm(function(){
				$.ajax({
					url: process_url,
					data: batch_ids,
					dataType: "json",
					type: "post",
					success: self.process_response
				});
			}, {
				message: $(this).attr("data-message"),
				params: [c, $(this).attr("data-type") ]
			});
		},
		click_phonebook_row: function(ele, table_id) {
			var aSelected = self.datatableSelected[table_id];
			var id = $(ele).attr("id");
			if (id)
				if ($(ele).hasClass("active")) {
					var index = aSelected.indexOf(id);
					if (index > -1) {
						aSelected.splice(index, 1);
					}
					$(ele).removeClass("active");
					$(ele).find("input[type='checkbox']").prop("checked", false);
				}
				else {
					$(ele).addClass("active");
					if (aSelected.indexOf(id) == -1) self.datatableSelected[table_id].push(id);
					$(ele).find("input[type='checkbox']").prop("checked", true);
				}
			if ($("tr.active").length == 0) {
				$(table_id+'.table thead tr input[type="checkbox"]').prop("checked", false);
			}
			if (aSelected.length) $(table_id+"-actions").fadeIn("fast");
			else $(table_id+"-actions").fadeOut("fast");
		},
		click_all_phonebook_rows: function(ele, table_id, checked) {
			var aSelected = self.datatableSelected[table_id];
			var id = $(ele).attr("id");
			if (id)
				if (!checked) {
					var index = aSelected.indexOf(id);
					if (index > -1) {
						aSelected.splice(index, 1);
					}
					$(ele).removeClass("active");
					$(ele).find("input[type='checkbox']").prop("checked", false);
				}
				else {
					$(ele).addClass("active");
					if (aSelected.indexOf(id) == -1) self.datatableSelected[table_id].push(id);
					$(ele).find("input[type='checkbox']").prop("checked", true);
				}
				if ($("tr.active").length == 0) {
					$(table_id+'.table thead tr input[type="checkbox"]').prop("checked", false);
				}
			if (aSelected.length) $(table_id+"-actions").fadeIn("fast");
			else $(table_id + "-actions").fadeOut("fast");
		},
		confirm: function(callback, options, onclose) {
			var settings = {
				title: "Confirm Action",
				message: "Are you sure you want to delete $0 selected $1?",
				button: "Yes",
				params: []
			};
			$.extend(settings, options);
			settings.params.forEach(function(e, i){
				settings.message = settings.message.replace("$" + i, e);
			});
			if ($("#confirm-popup").length == 0) return error("Confirm-popup is undefined");
			$("#confirm-popup-title").text(settings.title);
			$("#confirm-popup-message").html(settings.message);
			$("#confirm-popup").modal();
			$("#confirm-popup-confirm-btn").remove();
			$("#confirm-popup .modal-footer").append('<button id="confirm-popup-confirm-btn" class="btn btn-success">' + (settings.button) + '</button>');
			$("#confirm-popup-confirm-btn").click(function(){ $(this).html("<i class='fa fa-spin fa-spinner'></i> Loading").prop("disabled", true); }).click(callback);
			if (typeof onclose == "function") {
				$("#confirm-popup").on('hidden.bs.modal', onclose);
			}
		},
		clone: function() {
			var options = this;
			var clone = $(options.target).clone();
			if (options.clearSelector)
				clone.find(options.clearSelector).val("").text("").html("");
			else if (options.value)
				clone.find(options.clearSelector).val(value).text(value).html(value);

			if (options.prepend)
				$(options.container).prepend(clone);
			else if (options.before == "this")
				$(this).before(clone);
			else if (options.before) {
				$(options.before).before(clone);
			}
			else $(options.container).append(clone);
		},
		duplicate: function() {
			var options = $(this).data();
			var clone = $(options.target).clone();
			if (options.clearSelector)
				clone.find(options.clearSelector).val("").text("").html("");

			if (options.prepend)
				$(options.container).prepend(clone);
			else if (options.before == "this")
				$(this).before(clone);
			else if (options.before) {
				$(options.before).before(clone);
			}
			else $(options.container).append(clone);

			if (options.autofocus) $(clone).find(options.autofocus).focus();
		},
		form_date_range: function() {
			$(this).datepicker($(this).data()).on('changeDate', function(e){
				var target = $(e.target).data("real-date");
				$(target).val(e.format("yyyy-mm-dd"));
			});
		},
		line_check: function() {
			var label = $(this).next(), label_text = label.text();

			label.remove();
			$(this).iCheck({
				checkboxClass: 'icheckbox_line-' + $(this).data("color"),
				radioClass: 'iradio_line-' + $(this).data("color"),
				insert: '<div class="icheck_line-icon"></div>' + label_text
			});
			if ($(this).hasClass("relay-check"))
				$(this).on("ifChanged", self.relay_check);
		},
		square_check: function() {
			var label = $(this).next(), label_text = label.text();

			var color = $(this).data("color")? "-" + $(this).data("color"):"";

			$(this).iCheck({
				checkboxClass: 'icheckbox_square' + color,
				radioClass: 'icheckbox_square' + color,
				increaseArea: "20%"
			});
			if ($(this).hasClass("relay-check"))
				$(this).on("ifChanged", self.relay_check);
		},
		relay_check: function() {
			var checkbox = this;
			var checked = $(this).prop("checked");
			var children = $(this).data("children");
			var parents = $(this).data("parent");
			
			$(parents).each(function(){
				var parent = this;
				console.log(parent);
				if ($(parent).prop("checked") == false && checked)
					$(parent).prop("checked", true).iCheck("update");
			})
			if (checked) $(children).iCheck("check");
			else {
				$(children).iCheck("uncheck");
			}
		},
		options_line_chart: {
			series: {
				lines: { show: true },
				points: { show: true }
			},
			xaxis: {
				ticks: 5
			},
			yaxis: {
				ticks: 8,
				min: 0
			},
			grid: {
				backgroundColor: { colors: [ "#fff", "#eee" ] },
				borderWidth: {
					top: 1,
					right: 1,
					bottom: 2,
					left: 2
				}
			}
		}, 
		options_bar_chart: {
			series: {
				bars: {
					show: true,
					barWidth: 0.4,
					align: "center"
				}
			},
			xaxis: {
				mode: "categories",
				tickLength: 0
			},
			yaxis: {
				ticks: 8,
				min: 0
			},
			grid: {
				backgroundColor: { colors: [ "#fff", "#eee" ] },
				borderWidth: {
					top: 1,
					right: 1,
					bottom: 2,
					left: 2
				}
			}
		},
		options_pie_chart: {
			series: {
				pie: { show: true },
				points: { show: true }
			},
			xaxis: {
				ticks: 5
			},
			yaxis: {
				ticks: 8,
				min: 0
			},
			grid: {
				backgroundColor: { colors: [ "#fff", "#eee" ] },
				borderWidth: {
					top: 1,
					right: 1,
					bottom: 2,
					left: 2
				}
			}
		},
		render_chart: function(selector){
			$(selector).each(function() {
				var chart = $(this).attr("id");
				var dataset = $(this).data();

				if (!dataset.source) return error("Data source not defined");

				switch(dataset.chartType) {
					case "line": self.render_line_chart(chart, dataset); break;
					case "bar": self.render_bar_chart(chart, dataset); break;
					case "pie": self.render_pie_chart(chart, dataset); break;
				}

			});
		},
		render_line_chart: function(chart, dataset, options) {
			var scripts = ['assets/javascripts/flot/jquery.flot.js','assets/javascripts/flot/jquery.flot.resize.js','assets/javascripts/flot/jquery.flot.time.js'];

			self.async_script(scripts, function(){
				if (dataset.source)
					$.ajax({
						// have to use synchronous here, else the function 
						// will return before the data is fetched
						url: dataset.source,
						dataType:"json",
						success: function(response) {
							$.plot("#" + chart, response.data, $.extend({}, self.options_line_chart, response.options));
						}
					});
				else {
					$.plot(chart, dataset, $.extend({}, self.options_line_chart, options));
				}
			});
		},
		render_bar_chart: function(chart, dataset, options) {
			var scripts = ['assets/javascripts/flot/jquery.flot.js','assets/javascripts/flot/jquery.flot.resize.js','assets/javascripts/flot/jquery.flot.categories.js'];
							console.log(chart, dataset, options);

			self.async_script(scripts, function(){
				if (dataset.source)
					$.ajax({
						// have to use synchronous here, else the function 
						// will return before the data is fetched
						url: dataset.source,
						dataType:"json",
						success: function(response) {
							console.log("#" + chart, response.data, $.extend({}, self.options_bar_chart, response.options));
							$.plot("#" + chart, response.data, $.extend({}, self.options_bar_chart, response.options));
						}
					});
				else {
							console.log(chart, dataset, $.extend({}, self.options_bar_chart, options));
					$.plot(chart, dataset, $.extend({}, self.options_bar_chart, options));
				}
			});
		},
		render_pie_chart: function(chart, dataset, options) {
			var scripts = ['assets/javascripts/flot/jquery.flot.js','assets/javascripts/flot/jquery.flot.resize.js','assets/javascripts/flot/jquery.flot.pie.js'];

			self.async_script(scripts, function(){
				if (dataset.source)
					$.ajax({
						// have to use synchronous here, else the function 
						// will return before the data is fetched
						url: dataset.source,
						dataType:"json",
						success: function(response) {
							$.plot("#" + chart, response.data, $.extend({}, self.options_pie_chart, response.options));
						}
					});
				else {
					$.plot(chart, dataset, $.extend({}, self.options_pie_chart, options));
				}
			});
		},
		render_datatable: function(selector) {
			$(selector).each(function(){
				if (!$(this).attr("id")) return error("Table id is undefined");
				var datatable_id = "#" + $(this).attr("id");
				var datatable_id2 = $(this).attr("id");

				var options = $(this).data();
				var hasSelection = $(this).data("has-selection");
				var actionList;
				var colManip;
				try {
					actionList = eval($(datatable_id + "-row-actions").text());
				} catch(e) {  }

				try {
					colManip = eval($(datatable_id + "-col-manip").text());
				} catch(e) {  }

				if (options.hideCols) {
					options["aoColumnDefs"] = [ 
						{ "bVisible": false, "aTargets": options.hideCols }
					];
				}

				var settings = {
					"iDisplayLength": 10,
					"aaSorting": [[ (options.sorting === undefined? 0 : options.sorting), options.sortDir || "desc" ]],
					"bProcessing": true,
					"bServerSide": (options.sAjaxSource? true: false),
					"fnRowCallback": function( nRow, aData, iDisplayIndex ) 
					{
						if ( $.inArray(aData.DT_RowId, self.datatableSelected[datatable_id]) !== -1 ) 
						{
							$(nRow).addClass('active');
						}
						return nRow;
					},
					"fnInitComplete" : function()
					{
						if (hasSelection) 
							$("<th width='15px'><input type='checkbox' id='select_all' /></th>").insertBefore(datatable_id + ' thead tr th:first').change(function(){
								var checked = $(this).find("input[type='checkbox']").prop("checked");
								$(datatable_id + '.table tbody tr').each(function() {
									self.click_all_phonebook_rows(this, datatable_id, checked);
								});
							});

						if (actionList) $(datatable_id + ' thead tr').append("<th id='" + datatable_id2 + "-action-th'>Action</th>");
						$(datatable_id + "_filter input").prop("placeholder", "Search").prependTo($(datatable_id + "_filter"));
						$(datatable_id + "-actions").appendTo($(datatable_id + "_wrapper .datatable-row:eq(0)"));
					},
					"fnDrawCallback" : function()
					{
						if ($(".dataTables_empty").length) $(".dataTables_empty").attr("colspan", parseInt($(".dataTables_empty").attr("colspan")) + 2);

						if (hasSelection || actionList || colManip)
							$(this.fnGetNodes()).each(function()
							{
								if (hasSelection) 
								{
									$('<td><input type="checkbox" /></td>').insertBefore(datatable_id + " #" + this.id + " td:first");
									if ( $.inArray(this.id, self.datatableSelected[datatable_id]) !== -1 ) 
									{
										$(datatable_id + " #" + this.id + " td:first input[type='checkbox']").prop("checked", true);
										$(datatable_id + " #" + this.id).addClass("active");
									}
								}
								if (actionList) 
								{
									var sData = table.fnGetData( this );
									var row_id = this.id;
									var action_count = 0;

									var actions = $('<td class="action"></td>');
									$(this).append(actions).dblclick(function(){
										var dblclick = $(this).find("[data-dblclick='true']")[0];
										if (dblclick) dblclick.click();
									});

									$(actionList).each(function(){
										var show = true;
										if (this.showIf)
										{
											show = false;
											$(this.showIf).each(function(){
												if ($.inArray(sData[this.col], this.inArray) >= 0) {
													show = true;
												}
											});
										}
										if (this.hideIf)
										{
											show = true;
											$(this.hideIf).each(function(){
												if ($.inArray(sData[this.col], this.inArray) >= 0) {
													show = false;
												}
											});
										}
										if (show) {
											var action;
											if (this.url) {
												var params = "";
												if (this.params) {
													params = "?&";
													for (var param in this.params) {
														params += param + "=" + encodeURIComponent(this.params[param]);
													}
												}

												var url = this.url + params + (!this.noSlash?'/':'') + row_id + (this.url_suffix||"");

												action = $("<a title='" + this.action + "' " + (this.ajaxify === false? "href='" + url + "'" : " class='btn btn-default btn-xs ajaxify' " )+ " data-confirm='" + (this.confirm||"") + "' data-url='" + url + "' data-dblclick='" + (this.ondblclick || "") + "'><i class='app-row-icon fa fa-2 fa-" + this.icon + "'></i></a>&nbsp;");
												$(actions).append(action);
											}
											else if (this.handler && this.handler.fn_name && this.handler.fn) {
												action = $("<a onclick='" + this.handler.fn_name + "(this); return false;' title='" + this.action + "' data-dblclick='" + (this.ondblclick || "") + "'  class='btn btn-default btn-xs'><i class='app-row-icon fa fa-2 fa-" + this.icon + "'></i></a>&nbsp;");
												$(action).data(sData);
												$(actions).append(action);
												window[this.handler.fn_name] = this.handler.fn;
											}
											if (this.process_response) {
												var pr = this.process_response;
												$(action).click(function(){
													self.process_response(pr);
												});
											}

											action_count++;
										}
									});
									$(actions).css("width", action_count*66);

								}
								if (colManip) 
								{
									var sData = table.fnGetData( this );
									var row_id = this.id;

									$(colManip).each(function(){
										var manip = this;
										var offset = (hasSelection?1:0);

										if (options.hideCols)
											for (var i = 0; i < options.hideCols.length; i++) {
												if (options.hideCols[i] < manip.col) offset--;
											}

										var mapped = false;
										for(var condition in this.map){
											var value = this.map[condition];
											if (sData[manip.col] == condition || (condition == "default" && !mapped)) {
												mapped = true;
												var column = $(datatable_id + " #" + row_id).find("td:eq(" + (manip.col + offset) + ")");
												$(column).html(value.replace(/\{\{value\}\}/ig, sData[manip.col]));
											}
										}

										if (this.combine) {
											var value = this.combine.template;
											var values = [];
											for (var i in this.combine.values) {
												values[i] = eval(this.combine.values[i]);
											}
											for (var i in values) {
												value = value.replace(new RegExp("\\{\\{value\\[" + i + "\\]\\}\\}", "ig"), values[i]);
											}
											var column = $(datatable_id + " #" + row_id).find("td:eq(" + (manip.col + offset) + ")");
											$(column).html(value);
										}
									});
								}
							});

						if (hasSelection)
							$(datatable_id + ' tbody tr').on('click', function() {
								self.click_phonebook_row(this, datatable_id);
							});

						self.attach_handlers(datatable_id);
						if (options.refresh) {
							clearTimeout(self.timeouts[datatable_id2]);
							self.timeouts[datatable_id2] = setTimeout(function(){
								self.refresh_table.apply({target:datatable_id});
							}, options.refresh);
						}
					}
				}
				self.datatableSelected[datatable_id] = [];
				var table = $(datatable_id).dataTable($.extend({}, settings, options));
				table.fnSetFilteringDelay(500);
				self.datatables[datatable_id] = table;
			});
		},
		render_tree: function() {
			$('li:has(ul)', this).addClass('parent_li').find(' > span').attr('title', 'Collapse this branch');
			$('li.parent_li > span', this).on('click', function (e) {
				var children = $(this).parent('li.parent_li').find(' > ul > li');
				if (children.is(":visible")) {
					children.hide('fast');
					$(this).attr('title', 'Expand this branch').find(' > i').addClass('fa-plus').removeClass('fa-minus');
				} else {
					children.show('fast');
					$(this).attr('title', 'Collapse this branch').find(' > i').addClass('fa-minus').removeClass('fa-plus');
				}
				e.stopPropagation();
			});
		},
		server_status: function() {
			var data = $(this).data();
			var parent = this;
			$.ajax({
				url: data.url,
				beforeSend: function() {
					$(parent).html("<span class='label label-info'>Checking connection</span>");
				},
				success: function() {
					$(parent).html("<span class='label label-success'>Up</span>");
				},
				error: function() {
					$(parent).html("<span class='label label-danger'>Down</span>");
				}
			})
		},
		sms_count: function() {
			var input = this;
			self.async_script('assets/javascripts/pt-sms-counter.js', function(){
				$(input).sms_count();
			});
		},
		toggle: function(){
			$($(this).data('toggle')).toggle();
			$($(this).data('toggle') + ":visible").focus();
		},
		validate: function() {
			var input = this;
			var validation;
			var url = 'access/validation';
			var validation_xhr = null;
			var d = {
				field: $(this).attr("name"),
				form_id: $(this).parents("form").attr("id"),
				field_id: $(this).attr("id"),
				label: $(this).parents(".form-group").find("label").text(),
				validation: $(this).data("validation")
			}

			if (!d.validation) {  return; };
			if (!d.form_id) return error("Form ID not set");
			if (!d.field_id) return error("Input field ID not set");

			if (d.validation.match(/http(s)?:\/\//)) url = d.validation;

			validation = function(){
				d[d.field] = $(input).val();
				if (validation_xhr) validation_xhr.abort();
				validation_xhr = $.ajax({
					url: url,
					data: d,
					type: "POST",
					dataType: "json",
					success: self.process_response
				});
			}

			$(this).change(validation).blur(validation);
		},
	}

	var self = {
		temp_target : "",
		region_target : "#main_region",
		base_url: $("base").attr("href"),
		datatables: [],
		datatableSelected: [],
		socket_settings: general_settings && general_settings['socket.io.js'],
		scripts: [],
		styles: [],
		notifications: 0,
		xhrs: [],
		timeouts: [],
		init: function() { 
			if (self.socket_settings) self.connect_to_socket();
			if (general_settings && general_settings.debug) {
				self.debug = true;
				window.app = self;
				window.onerror = function(message, url, lineNumber) {	
					if ($.pnotify) $.pnotify({title: "App Error", type: "error", "text": "<a href='" + url + "' target='_blank'>File</a> Line #" + lineNumber + ":<br/>" + message, hide: false});
				};
				$( document ).ajaxError(function(o,e,s) {
					if (e.statusText != "abort" && e.statusText != "OK" && e.responseText) {
						$.pnotify({
							text: "Message from server: " + s.url + " " + e.responseText,
							title: "Error loading ajax",
							type: "warning"
						});
					}
					else if (e.statusText != "abort" && e.statusText != "OK" && !e.responseText)
						$.pnotify({
							text: "Server forgot to return any data. " + s.url,
							title: "Error loading ajax",
							type: "warning"
						});
				});
			}

			window.addEventListener("online", function(e) {
				$(".offline").hide();
			}, true);
			window.addEventListener("offline", function(e) {
				$(".offline").show();
			}, true);
			
			// Check if a new cache is available on page load.
			if (window.applicationCache) {

				window.applicationCache.addEventListener('updateready', function(e) {
				if (window.applicationCache.status == window.applicationCache.UPDATEREADY) {
					// Browser downloaded a new app cache.
					self.confirm(function() {
						window.location.reload();
					}, {
						message: 'A new version of this software application is available.',
						button: "DOWNLOAD",
						title: 'Application Update'
					});
				}
				}, false);
				
				// An update was found. The browser is fetching resources.
				window.applicationCache.addEventListener('progress', function(e){
					
				}, false);

				setInterval(function() {
					try {
						window.applicationCache.update();
					} catch(e) {
					}
				}, 600000);
			}

			self.attach_handlers();
			$.fn.modal.Constructor.prototype.enforceFocus = function () {};
			$.pnotify.defaults.styling = "bootstrap3";
			$.pnotify.defaults.animation = 'none';
			$.pnotify.defaults.history.menu = false;
			$.pnotify.defaults.history.history = false;
			$.pnotify.defaults.position_animate_speed = 150;

			if (location.hash.indexOf("!") == 1) {
				self.load.apply({url: location.hash.substr(2)});
			}
			else if (general_settings && general_settings['initial_load']) {
				self.load.apply({url: general_settings['initial_load']});
			}
			$(window).on('hashchange', function() {
				if (!self.route_set_from_controller) {
					self.load.apply({url: location.hash.substr(2)});
				}
				self.route_set_from_controller = false;
			});
			window.onpopstate = function(e){
				if (e.state) {
					self.route_set_from_popstate = true;
					var btn = $(".ajaxify[data-url='" + self.base_url + e.state.url + "']");
					var btnText = $(btn).html();
					var reg = /^<[a-z]+ .*fa fa-[0-9a-z \-]+.*><\/[a-z]+>$/ig;
					if ($.trim(btnText).match(reg))
						$(btn).prop("disabled", true).html("<i class='fa fa-spin fa-spinner'></i>");
					else $(btn).prop("disabled", true).html("<i class='fa fa-spin fa-spinner'></i> Loading");

					self.load.apply({url: e.state.url, complete: function() {
						$(btn).prop("disabled", false).html(btnText);
					}});
					if (e.title) document.title = e.state.title;
				}
			};
		},
		async_styles: function(links) {
			if (typeof links != "object") links = [links];
			$(links).each(function(){
				$('<style type="text/css"></style>').html('@import url("' + this + '")').appendTo("head");
			});
		},
		async_script: function(src, callback) {
			if (typeof src != "object") src = [src];
			if (src.length == 0) {
				callback();
			}
			else {
				if (self.scripts.indexOf(src[0]) > -1)
				{
					src.splice(0,1);
					self.async_script(src, callback);
				}
				else {
					$.ajax({
						url: src[0],
						dataType: "script",
						success: function() {
							self.scripts.push(src[0]);
							src.splice(0,1);
							self.async_script(src, callback);
						}, error: function(e) {
							if (e.status == 200) {
								src.splice(0,1);
								self.async_script(src, callback);
							}
						}
					});
				}
			}
		},
		connect_to_socket: function() {
			self.get_notifications(self.socket_settings.notifications_url);
			self.async_script(self.socket_settings.script, function(){
				if (typeof io !== 'undefined') {
					self.socket = io.connect(self.socket_settings.connection);
					self.socket.on('connect', function(){
						$(".offline").hide();
						self.socket.emit("set user data", self.socket_settings.identity);
					});
					self.socket.on('disconnect', function(){
						$(".offline").show();
					});
					self.socket.on("session_destroyed", self.session_destroyed);
					self.socket.on("process_commands", self.process_response);
					self.socket.on("notify", function(notif) {
						notif.from_socket = true;
						var data = [notif];
						$.pnotify({
							title: notif.subject,
							text: notif.body,
							type: notif.type
						});
						self.process_notifications(data);
					});
				}
			});
		},
		format_notification: function(notif) {
			var template =
				"<li>" + 
					"<a class='title'>" +
						"<span class='label label-{{type}}'>{{subject}}</span>" + 
						'<button title="Mark as read" type="button" style="margin-right:5px" class="close new notification-mark-as-read" aria-hidden="true">&times;</button>' +
					"</a>" + 
					"<p class='body'>{{body}}</p>" +
					"<hr>" +
				"</li>";
			if (notif.type == "normal") notif.type = "default";
			else if (notif.type == "error") notif.type = "danger";
			for (var i in notif) {
				template = template.replace("{{" + i + "}}", notif[i]);
			}
			return template;
		},
		get_notifications: function (url) { // Get all notifications from server via HTTP
			$.ajax({ url:url, dataType: "json",
				success: function(data) {
					self.notifications = 0;
					self.process_notifications(data);
				}
			});
		},
		process_notifications: function(data){
			self.notifications += data.length;

			data.reverse();
			data.forEach(function(notif,i){
				notif = $(self.format_notification(notif))
				.click(function(e){ e.stopPropagation(); })
				.prependTo("#notifications-dropdown");
			});

			$(".notification-mark-as-read.new").removeClass("new").click(self.remove_notification);
			self.update_notification_label();
		},
		remove_notification: function(e){
			var parent = $(this).parents("#notifications-dropdown>li");
			var button = this;
			self.confirm(function(){
				$.ajax({
					url: self.socket_settings.delete_url +$(button).attr("data-id"),
					type: "DELETE",
					beforeSend: function() {
						$(button).prop("disabled", true);
					},
					success: function(res){
						self.notifications--;
						self.update_notification_label();
						$(parent).remove();
						$("#confirm-popup").modal("hide");
					}, error: function() {
						setTimeout(function() { $(button).prop("disabled", false); }, 5000);
						$.pnotify({
							title: "Error",
							text: "We could not mark the notification as read at the moment. Pleas try again later.",
							type: "error"
						});
					}
				});
			}, {
				message: "Are you sure want to delete this notification?"
			});
			e.preventDefault();
			e.stopPropagation();
		},
		test_notification: function(data) {
			if (self.socket) self.socket.emit('sendNotif', data);
		},
		update_notification_label: function(){
			if (self.notifications) $("#notifications").show();
			else $("#notifications").hide();
			$("#notifications-label").text(self.notifications + " notification" + (self.notifications== 1?"":"s"));
		},
	}

	$.extend(self, on_load_functions, ajax_commands);

	self.init();

	function error(msg) {
		$.pnotify({
			text: msg,
			title: "Code error",
			type: "error"
		});
		return true;
	}

	function warning(msg) {
		$.pnotify({
			text: msg,
			title: "Code warning",
			type: "warning"
		});
		return true;
	}

	return self;
}

String.prototype.ucwords = function() {
	str = this.toLowerCase();
	return str.replace(/(^([a-zA-Z\p{M}]))|([ -][a-zA-Z\p{M}])/g,
		function($1){
			return $1.toUpperCase();
		});
}
